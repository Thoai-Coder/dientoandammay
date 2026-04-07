const uploadForm = document.getElementById("uploadForm");
const invoiceFile = document.getElementById("invoiceFile");
const uploadStatus = document.getElementById("uploadStatus");
const invoiceList = document.getElementById("invoiceList");
const refreshBtn = document.getElementById("refreshBtn");

async function loadInvoices() {
  invoiceList.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Đang tải dữ liệu...</p>
    </div>
  `;

  try {
    const res = await fetch("/api/invoices");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Không tải được dữ liệu");
    }

    if (!Array.isArray(data) || data.length === 0) {
      invoiceList.innerHTML = `<div class="empty-state">Chưa có dữ liệu</div>`;
      return;
    }

    invoiceList.innerHTML = data.map((item) => {
      const statusClass = getStatusClass(item.status);

      return `
        <article class="invoice-card">
          <div class="invoice-top">
            <div>
              <h3>${escapeHtml(item.fileName || "Không tên file")}</h3>
              <p class="subline">${formatDate(item.createdAt)}</p>
            </div>
            <span class="status-pill ${statusClass}">
              ${escapeHtml(item.status || "unknown")}
            </span>
          </div>

          <div class="invoice-grid">
            <div class="info-box">
              <span class="label">Vendor</span>
              <span class="value">${escapeHtml(item.vendor || "Chưa xác định")}</span>
            </div>

            <div class="info-box">
              <span class="label">Ngày hóa đơn</span>
              <span class="value">${escapeHtml(item.invoiceDate || "Chưa xác định")}</span>
            </div>

            <div class="info-box highlight">
              <span class="label">Tổng tiền</span>
              <span class="value money">${escapeHtml(item.totalAmount || "Chưa xác định")}</span>
            </div>

            <div class="info-box">
              <span class="label">Bucket</span>
              <span class="value">${escapeHtml(item.bucket || "")}</span>
            </div>
          </div>

          <div class="meta">
            <p><strong>GCS URI:</strong> ${escapeHtml(item.gcsUri || "")}</p>
          </div>

          <div class="actions">
            <button class="small-btn" onclick="toggleText('${item.id}')">
              Xem OCR text
            </button>
          </div>

          <div id="ocr-${item.id}" class="ocr-box" style="display:none;">
            <pre>${escapeHtml(item.text || "Không có OCR text")}</pre>
          </div>
        </article>
      `;
    }).join("");
  } catch (error) {
    invoiceList.innerHTML = `
      <div class="empty-state error-text">
        Lỗi tải dữ liệu: ${escapeHtml(error.message)}
      </div>
    `;
  }
}

function toggleText(id) {
  const el = document.getElementById(`ocr-${id}`);
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "block";
  if (el.dataset.open === "true") {
    el.style.display = "none";
    el.dataset.open = "false";
  } else {
    el.style.display = "block";
    el.dataset.open = "true";
  }
}

function getStatusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "processed") return "success";
  if (s === "uploaded") return "warning";
  return "default";
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "Không rõ thời gian";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("vi-VN");
}

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = invoiceFile.files[0];
  if (!file) {
    setStatus("Vui lòng chọn file trước", "error");
    return;
  }

  setStatus("Đang upload file lên Cloud Storage...", "");

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

    setStatus("Upload thành công. Hệ thống đang OCR tự động, vui lòng đợi vài giây.", "success");
    uploadForm.reset();

    setTimeout(() => {
      loadInvoices();
    }, 3000);
  } catch (error) {
    setStatus(`Lỗi: ${error.message}`, "error");
  }
});

function setStatus(message, type) {
  uploadStatus.className = "status";
  if (type) {
    uploadStatus.classList.add(type);
  }
  uploadStatus.textContent = message;
}

refreshBtn.addEventListener("click", loadInvoices);

loadInvoices();
