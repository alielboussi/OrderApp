type ReportRow = {
  item_name: string;
  qty_units: number;
  before_tax: number;
  after_tax: number;
};

type ReportTotals = {
  before: number;
  after: number;
  qty: number;
};

type ReportPdfOptions = {
  outletText: string;
  rangeText: string;
  rows: ReportRow[];
  totals: ReportTotals;
  logoDataUrl?: string;
  watermarkText?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function buildReportPdfHtml(options: ReportPdfOptions): string {
  const {
    outletText,
    rangeText,
    rows,
    totals,
    logoDataUrl,
    watermarkText = "Afterten Takeaway & Restaurant",
  } = options;

  const rowsHtml = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.item_name)}</td>
          <td>${formatQty(row.qty_units)}</td>
          <td>${formatCurrency(row.before_tax)}</td>
          <td>${formatCurrency(row.after_tax)}</td>
        </tr>
      `
    )
    .join("");

  const watermarkSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='420' height='220'>
    <style>
      text { font-family: Arial, sans-serif; font-size: 18px; fill: #111827; }
    </style>
    <text x='0' y='40'>${watermarkText}</text>
    <text x='0' y='120'>${watermarkText}</text>
    <text x='0' y='200'>${watermarkText}</text>
  </svg>`;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Afterten Sales Report</title>
        <style>
          @page {
            size: A4;
            margin: 12mm 10mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: "Segoe UI", Arial, sans-serif;
            color: #111827;
            margin: 0;
            padding: 0;
            background: #fff;
          }
          .page {
            position: relative;
            border: 2mm solid #b91c1c;
            padding: 12mm 10mm 16mm;
            min-height: 100vh;
          }
          .watermark {
            position: fixed;
            inset: 0;
            opacity: 0.16;
            z-index: 0;
            background-image: url("data:image/svg+xml;utf8,${encodeURIComponent(watermarkSvg)}");
            background-repeat: repeat;
            background-size: 520px 260px;
            pointer-events: none;
          }
          .watermark-text {
            position: fixed;
            inset: 0;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            grid-auto-rows: 140px;
            gap: 60px;
            padding: 28mm 10mm;
            opacity: 0.14;
            z-index: 0;
            pointer-events: none;
            font-size: 30px;
            font-weight: 600;
            color: #111827;
            transform: rotate(-28deg);
            transform-origin: center;
          }
          @media print {
            .watermark { opacity: 0.16 !important; }
            .watermark-text { opacity: 0.14 !important; }
          }
          .content {
            position: relative;
            z-index: 1;
          }
          .header {
            display: grid;
            grid-template-columns: 80px 1fr 80px;
            align-items: center;
            gap: 16px;
            margin-bottom: 12px;
          }
          .logo {
            width: 80px;
            height: 80px;
            object-fit: contain;
          }
          .title {
            text-align: center;
            font-size: 22px;
            font-weight: 700;
            letter-spacing: 0.4px;
          }
          .subheader {
            margin-top: 8px;
            margin-bottom: 14px;
            font-size: 12.5px;
            color: #374151;
            display: grid;
            gap: 6px;
            text-align: center;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
            border: 2px solid #b91c1c;
          }
          th, td {
            border-bottom: 1px solid #f2b6b6;
            padding: 12px 10px;
            font-size: 13px;
            text-align: center;
          }
          th {
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 0.6px;
            color: #6b7280;
          }
          tbody tr:last-child td { border-bottom: none; }
          tfoot td {
            font-weight: 700;
            border-top: 2px solid #b91c1c;
            background: rgba(185, 28, 28, 0.05);
          }
          .totals {
            margin-top: 16px;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            font-size: 12px;
          }
          .totals div {
            border: 1px solid #e5e7eb;
            padding: 10px;
            border-radius: 8px;
            text-align: center;
          }
          .label { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
          .value { font-weight: 700; font-size: 13px; margin-top: 4px; }
          .footer {
            margin-top: 18px;
            display: grid;
            gap: 12px;
          }
          .page-number {
            position: fixed;
            bottom: 8mm;
            right: 12mm;
            font-size: 10px;
            color: #374151;
          }
          .page-number::after {
            content: "Page " counter(page) " of " counter(pages);
          }
          table, tr, td, th { page-break-inside: avoid; }
        </style>
      </head>
      <body>
        <div class="watermark"></div>
        <div class="watermark-text">
          ${Array.from({ length: 20 })
            .map(() => `<div>${escapeHtml(watermarkText)}</div>`)
            .join("")}
        </div>
        <div class="page">
          <div class="content">
            <div class="header">
              ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="Afterten" />` : "<div></div>"}
              <div class="title">Afterten Sales Report</div>
              <div></div>
            </div>
            <div class="subheader">
              <div><strong>Outlets:</strong> ${escapeHtml(outletText)}</div>
              <div><strong>Date range:</strong> ${escapeHtml(rangeText)}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Units Sold</th>
                  <th>Before Tax</th>
                  <th>After Tax</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="4">No data for selected filters.</td></tr>`}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>${formatQty(totals.qty)}</td>
                  <td>${formatCurrency(totals.before)}</td>
                  <td>${formatCurrency(totals.after)}</td>
                </tr>
              </tfoot>
            </table>
            <div class="totals">
              <div>
                <div class="label">Sales Before Tax</div>
                <div class="value">${formatCurrency(totals.before)}</div>
              </div>
              <div>
                <div class="label">Sales After Tax</div>
                <div class="value">${formatCurrency(totals.after)}</div>
              </div>
              <div>
                <div class="label">Units Sold</div>
                <div class="value">${formatQty(totals.qty)}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="page-number"></div>
        <script>
          window.onload = () => {
            setTimeout(() => window.print(), 300);
          };
        </script>
      </body>
    </html>
  `;
}
