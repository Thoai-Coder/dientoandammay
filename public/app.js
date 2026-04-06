const uploadForm = document.getElementById("uploadForm");
const invoiceFile = document.getElementById("invoiceFile");
const uploadStatus = document.getElementById("uploadStatus");
const invoiceList = document.getElementById("invoiceList");
const refreshBtn = document.getElementById("refreshBtn");

async function loadInvoices() {
  invoiceList.innerHTML = "<p>Đang tải dữ liệu...</p>";

  try {
    const res = await fetch("/api/invoices");
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      invoiceList.innerHTML = "<p>Chưa có dữ liệu</p>";
      return;
    }

    invoiceList.innerHTML = data.map(item => `
      <div class="invoice-item">
        <h3>${item.file_name || "Không tên file"}</h3>
        <p><strong>Vendor:</strong> ${item.vendor || "Chưa xác định"}</p>
        <p><strong>Ngày hóa đơn:</strong> ${item.invoice_date || "Chưa xác định"}</p>
        <p><strong>Tổng tiền:</strong> ${item.total_amount || "Chưa xác định"}</p>
        <p><strong>Bucket:</strong> ${item.bucket || ""}</p>
        <p><strong>Uploaded:</strong> ${item.uploaded_at || ""}</p>
        <p><strong>GCS URI:</strong> ${item.gcs_uri || ""}</p>
        <p><strong>Status:</strong> ${item.status || ""}</p>
        <button class="small-btn" onclick="toggleText('${item.id}')">Xem OCR text</button>
        <div id="ocr-${item.id}" style="display:none; margin-top:10px;">
          <pre>${escapeHtml(item.text || "Không có OCR text")}</pre>
        </div>
      </div>
    `).join("");
  } catch (error) {
    invoiceList.innerHTML = <p style="color:red;">Lỗi tải dữ liệu: ${error.message}</p>;
  }
}

function toggleText(id) {
  const el = document.getElementById(ocr-${id});
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = invoiceFile.files[0];
  if (!file) {
    uploadStatus.className = "status error";
    uploadStatus.textContent = "Vui lòng chọn file trước";
    return;
  }

  uploadStatus.className = "status";
  uploadStatus.textContent = "Đang upload và OCR...";

  const formData = new FormData();
  formData.append("invoice", file);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Upload thất bại");
    }

    uploadStatus.className = "status success";
    uploadStatus.textContent = "Upload thành công!";
    uploadForm.reset();
    await loadInvoices();
  } catch (error) {
    uploadStatus.className = "status error";
    uploadStatus.textContent = Lỗi: ${error.message};
  }
});

refreshBtn.addEventListener("click", loadInvoices);

loadInvoices();