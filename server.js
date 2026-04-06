require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");

const { Storage } = require("@google-cloud/storage");
const vision = require("@google-cloud/vision");
const { Firestore } = require("@google-cloud/firestore");

const app = express();
const PORT = process.env.PORT || 8080;

const BUCKET_NAME = process.env.BUCKET_NAME;
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;

if (!BUCKET_NAME) {
  console.error("Missing BUCKET_NAME in environment variables");
  process.exit(1);
}

const storage = new Storage({
  projectId: GOOGLE_CLOUD_PROJECT
});

const visionClient = new vision.ImageAnnotatorClient({
  projectId: GOOGLE_CLOUD_PROJECT
});

const firestore = new Firestore({
  projectId: GOOGLE_CLOUD_PROJECT
});

const bucket = storage.bucket(BUCKET_NAME);

// Upload file vào RAM trước, rồi đẩy lên GCS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function extractInvoiceInfo(text) {
  if (!text) {
    return {
      vendor: "Chưa xác định",
      invoiceDate: "Chưa xác định",
      totalAmount: "Chưa xác định"
    };
  }

  const cleanText = text.replace(/\r/g, "");
  const lines = cleanText.split("\n").map(line => line.trim()).filter(Boolean);

  let vendor = "Chưa xác định";
  let invoiceDate = "Chưa xác định";
  let totalAmount = "Chưa xác định";

  // Vendor: lấy dòng đầu có chữ, không quá dài, không toàn số
  for (const line of lines.slice(0, 10)) {
    const hasLetters = /[A-Za-zÀ-ỹ]/.test(line);
    const notTooLong = line.length > 2 && line.length < 60;
    const notMostlyNumbers = !/^\d[\d\s\-.,/:]*$/.test(line);
    if (hasLetters && notTooLong && notMostlyNumbers) {
      vendor = line;
      break;
    }
  }

  // Date patterns
  const datePatterns = [
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
    /\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/,
    /\bngày\s*\d{1,2}\s*tháng\s*\d{1,2}\s*năm\s*\d{4}\b/i
  ];

  for (const pattern of datePatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      invoiceDate = match[0];
      break;
    }
  }

  // Total amount: tìm các từ khóa thường gặp
  const totalPatterns = [
    /(tổng cộng|tổng tiền|thành tiền|grand total|total)\s*[:\-]?\s*([\d.,]+)/i,
    /([\d]{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?)\s*(vnd|đ|vnđ)?/gi
  ];

  const directMatch = cleanText.match(totalPatterns[0]);
  if (directMatch && directMatch[2]) {
    totalAmount = directMatch[2];
  } else {
    // fallback: lấy số tiền lớn nhất
    const candidates = [...cleanText.matchAll(totalPatterns[1])].map(m => m[1]);
    if (candidates.length > 0) {
      const normalized = candidates
        .map(v => ({
          raw: v,
          numeric: Number(v.replace(/\./g, "").replace(/,/g, ""))
        }))
        .filter(v => !isNaN(v.numeric))
        .sort((a, b) => b.numeric - a.numeric);

      if (normalized.length > 0) {
        totalAmount = normalized[0].raw;
      }
    }
  }

  return { vendor, invoiceDate, totalAmount };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "invoice-ocr-app",
    bucket: BUCKET_NAME
  });
});

app.post("/api/upload", upload.single("invoice"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Chưa chọn file" });
    }

    const originalName = req.file.originalname;
    const safeName = `${Date.now()}-${originalName.replace(/\s+/g, "_")}`;
    const gcsFile = bucket.file(safeName);

    await gcsFile.save(req.file.buffer, {
      metadata: {
        contentType: req.file.mimetype
      },
      resumable: false
    });

    const gcsUri = `gs://${BUCKET_NAME}/${safeName}`;

    // OCR bằng Vision API
    const [result] = await visionClient.textDetection(gcsUri);
    const detections = result.textAnnotations || [];
    const extractedText = detections.length > 0 ? detections[0].description : "";

    const parsed = extractInvoiceInfo(extractedText);

    const docData = {
      file_name: originalName,
      stored_name: safeName,
      bucket: BUCKET_NAME,
      gcs_uri: gcsUri,
      content_type: req.file.mimetype,
      text: extractedText || "",
      vendor: parsed.vendor,
      invoice_date: parsed.invoiceDate,
      total_amount: parsed.totalAmount,
      status: "processed",
      uploaded_at: new Date().toISOString()
    };

    const docRef = await firestore.collection("invoices").add(docData);

    res.json({
      success: true,
      id: docRef.id,
      message: "Upload và OCR thành công",
      data: docData
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: "Lỗi xử lý file",
      details: error.message
    });
  }
});

app.get("/api/invoices", async (req, res) => {
  try {
    const snapshot = await firestore
      .collection("invoices")
      .orderBy("uploaded_at", "desc")
      .get();

    const invoices = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(invoices);
  } catch (error) {
    console.error("Fetch invoices error:", error);
    res.status(500).json({
      error: "Không lấy được danh sách hóa đơn",
      details: error.message
    });
  }
});

app.get("/api/invoices/:id", async (req, res) => {
  try {
    const doc = await firestore.collection("invoices").doc(req.params.id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Không tìm thấy hóa đơn" });
    }

    res.json({
      id: doc.id,
      ...doc.data()
    });
  } catch (error) {
    console.error("Get invoice error:", error);
    res.status(500).json({
      error: "Không lấy được chi tiết hóa đơn",
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
