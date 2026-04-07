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
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "invoice-app",
    bucket: BUCKET_NAME,
    project: GOOGLE_CLOUD_PROJECT,
    mode: "event-driven"
  });
});

app.post("/api/upload", upload.single("invoice"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "Chưa chọn file"
      });
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

    return res.json({
      success: true,
      message: "Upload thành công. Hệ thống đang OCR tự động.",
      fileName: originalName,
      storedName: safeName,
      gcsUri,
      status: "uploaded"
    });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({
      success: false,
      error: "Lỗi upload file",
      details: error.message
    });
  }
});

app.get("/api/invoices", async (req, res) => {
  try {
    const snapshot = await firestore
      .collection("invoices")
      .orderBy("createdAt", "desc")
      .get();

    const invoices = snapshot.docs.map((doc) => {
      const data = doc.data() || {};

      return {
        id: doc.id,
        fileName: data.fileName || "",
        bucket: data.bucket || "",
        gcsUri: data.gcsUri || "",
        contentType: data.contentType || "",
        text: data.text || "",
        vendor: data.vendor || "Chưa xác định",
        invoiceDate: data.invoiceDate || "Chưa xác định",
        totalAmount: data.totalAmount || "Chưa xác định",
        status: data.status || "unknown",
        createdAt: data.createdAt || ""
      };
    });

    return res.json(invoices);
  } catch (error) {
    console.error("Fetch invoices error:", error);
    return res.status(500).json({
      error: "Không lấy được danh sách hóa đơn",
      details: error.message
    });
  }
});

app.get("/api/invoices/:id", async (req, res) => {
  try {
    const doc = await firestore.collection("invoices").doc(req.params.id).get();

    if (!doc.exists) {
      return res.status(404).json({
        error: "Không tìm thấy hóa đơn"
      });
    }

    const data = doc.data() || {};

    return res.json({
      id: doc.id,
      fileName: data.fileName || "",
      bucket: data.bucket || "",
      gcsUri: data.gcsUri || "",
      contentType: data.contentType || "",
      text: data.text || "",
      vendor: data.vendor || "Chưa xác định",
      invoiceDate: data.invoiceDate || "Chưa xác định",
      totalAmount: data.totalAmount || "Chưa xác định",
      status: data.status || "unknown",
      createdAt: data.createdAt || ""
    });
  } catch (error) {
    console.error("Get invoice error:", error);
    return res.status(500).json({
      error: "Không lấy được chi tiết hóa đơn",
      details: error.message
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
