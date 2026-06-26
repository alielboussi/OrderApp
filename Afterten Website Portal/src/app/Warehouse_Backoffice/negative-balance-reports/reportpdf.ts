type NegativeBalanceRow = {
  created_at: string;
  outlet_name: string;
  kind: string;
  item_name: string;
  related_label: string;
  warehouse_name: string;
  requested_qty: number;
  available_qty: number | null;
  shortage_qty: number;
};

type NegativeBalanceTotals = {
  count: number;
  orderCount: number;
  recipeCount: number;
  shortageTotal: number;
};

type NegativeBalancePdfOptions = {
  outletText: string;
  rangeText: string;
  filtersText?: string;
  rows: NegativeBalanceRow[];
  totals: NegativeBalanceTotals;
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

function formatQty(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function buildNegativeBalancePdfHtml(options: NegativeBalancePdfOptions): string {
  const {
    outletText,
    rangeText,
    filtersText,
    rows,
    totals,
    logoDataUrl,
    watermarkText = "Afterten Takeaway & Restaurant",
  } = options;

  const maxRowsPerPage = 24;
  const totalRows = rows.length;
  const pageCount = totalRows ? Math.ceil(totalRows / maxRowsPerPage) : 1;
  const rowsPerPage = totalRows ? Math.ceil(totalRows / pageCount) : 0;
  const rowChunks = totalRows
    ? Array.from({ length: pageCount }, (_, index) => rows.slice(index * rowsPerPage, (index + 1) * rowsPerPage))
    : [[]];

  const renderRowsHtml = (pageRows: NegativeBalanceRow[]) =>
    pageRows
      .map(
        (row) => `
        <tr>
          <td>${escapeHtml(row.created_at)}</td>
          <td>${escapeHtml(row.outlet_name)}</td>
          <td>${escapeHtml(row.kind)}</td>
          <td>${escapeHtml(row.item_name)}</td>
          <td>${escapeHtml(row.related_label)}</td>
          <td>${escapeHtml(row.warehouse_name)}</td>
          <td>${formatQty(row.requested_qty)}</td>
          <td>${row.available_qty == null ? "-" : formatQty(row.available_qty)}</td>
          <td>${formatQty(row.shortage_qty)}</td>
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
        <title>Afterten Negative Balance Report</title>
        <style>
          @page {
            size: A4;
            margin: 12mm 8mm;
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
            border: 2mm solid #0f766e;
            padding: 10mm 8mm 14mm;
            min-height: 277mm;
            display: flex;
            flex-direction: column;
            page-break-after: always;
          }
          .page:last-child { page-break-after: auto; }
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
          .content {
            position: relative;
            z-index: 1;
            display: flex;
            flex-direction: column;
            min-height: 100%;
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
            border: 2px solid #0f766e;
          }
          th, td {
            border-bottom: 1px solid #99f6e4;
            padding: 9px 7px;
            font-size: 10.5px;
            text-align: center;
          }
          th {
            text-transform: uppercase;
            font-size: 9.5px;
            letter-spacing: 0.6px;
            color: #6b7280;
          }
          tbody tr:last-child td { border-bottom: none; }
          tfoot td {
            font-weight: 700;
            border-top: 2px solid #0f766e;
            background: rgba(13, 148, 136, 0.08);
          }
          .totals {
            margin-top: 16px;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
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
          .page-number {
            position: absolute;
            bottom: 8mm;
            right: 12mm;
            font-size: 10px;
            color: #374151;
          }
          table, tr, td, th { page-break-inside: avoid; }
        </style>
      </head>
      <body>
        ${rowChunks
          .map((pageRows, index) => {
            const pageLabel = `Page ${index + 1} of ${rowChunks.length}`;
            const showTotals = index === rowChunks.length - 1;
            return `
        <div class="page">
          <div class="watermark"></div>
          <div class="content">
            <div class="header">
              ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="Afterten" />` : "<div></div>"}
              <div class="title">Negative Balance Alerts</div>
              <div></div>
            </div>
            <div class="subheader">
              <div><strong>Outlets:</strong> ${escapeHtml(outletText)}</div>
              <div><strong>Date range:</strong> ${escapeHtml(rangeText)}</div>
              ${filtersText ? `<div><strong>Filters:</strong> ${escapeHtml(filtersText)}</div>` : ""}
              <div><strong>Rows:</strong> ${totalRows.toLocaleString()}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Outlet</th>
                  <th>Type</th>
                  <th>Item</th>
                  <th>Related</th>
                  <th>Warehouse</th>
                  <th>Requested</th>
                  <th>Available</th>
                  <th>Shortage</th>
                </tr>
              </thead>
              <tbody>
                ${renderRowsHtml(pageRows)}
              </tbody>
            </table>
            ${showTotals ? `
            <div class="totals">
              <div>
                <div class="label">Alerts</div>
                <div class="value">${totals.count.toLocaleString()}</div>
              </div>
              <div>
                <div class="label">Order Shortages</div>
                <div class="value">${totals.orderCount.toLocaleString()}</div>
              </div>
              <div>
                <div class="label">Recipe Shortages</div>
                <div class="value">${totals.recipeCount.toLocaleString()}</div>
              </div>
              <div>
                <div class="label">Total Shortage</div>
                <div class="value">${formatQty(totals.shortageTotal)}</div>
              </div>
            </div>
            ` : ""}
          </div>
          <div class="page-number">${pageLabel}</div>
        </div>
      `;
          })
          .join("")}
      </body>
    </html>
  `;
}
