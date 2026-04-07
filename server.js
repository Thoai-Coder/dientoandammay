require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");

const { Storage } = require("@google-cloud/storage");
const { Firestore } = require("@google-cloud/firestore");

const app = express();
const PORT = process.env.PORT || 8080;

const BUCKET_NAME = process.env.BUCKET_NAME || "nhom20";
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "nhom20-492407";

const storage = new Storage({
  projectId: GOOGLE_CLOUD_PROJECT
});

const firestore = new Firestore({
  projectId: GOOGLE_CLOUD_PROJECT
});

const bucket = storage.bucket(BUCKET_NAME);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "invoice-ocr-app",
    bucket: BUCKET_NAME,
    mode: "upload-only-event-driven"
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

    res.json({
      success: true,
      message: "Upload thành công, file đã đưa lên Cloud Storage và đang chờ OCR xử lý",
      file_name: originalName,
      stored_name: safeName,
      gcs_uri: gcsUri,
      status: "uploaded"
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: "Lỗi upload file",
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
