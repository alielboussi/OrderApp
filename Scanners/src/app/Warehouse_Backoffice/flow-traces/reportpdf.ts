type FlowTraceRow = {
  flow_batch_id?: string | null;
  created_at: string;
  outlet_name: string;
  level: string;
  item_name: string;
  variant_label: string;
  warehouse_name: string;
  total_delta: number;
  available_units: number | null;
  negative: boolean;
};

type FlowTraceTotals = {
  count: number;
  negativeCount: number;
  totalDelta: number;
};

type FlowTracePdfOptions = {
  outletText: string;
  rangeText: string;
  timeText?: string;
  rows: FlowTraceRow[];
  totals: FlowTraceTotals;
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

function formatBatchId(value?: string | null): string {
  if (!value) return "-";
  return value.length <= 8 ? value : value.slice(0, 4) + "..." + value.slice(-4);
}

export function buildFlowTracePdfHtml(options: FlowTracePdfOptions): string {
  const {
    outletText,
    rangeText,
    timeText,
    rows,
    totals,
    logoDataUrl,
    watermarkText = "Afterten Takeaway & Restaurant",
  } = options;
  const maxRowsPerPage = 26;
  const totalRows = rows.length;
  const pageCount = totalRows ? Math.ceil(totalRows / maxRowsPerPage) : 1;
  const rowsPerPage = totalRows ? Math.ceil(totalRows / pageCount) : 0;
  const rowChunks = totalRows
    ? Array.from({ length: pageCount }, (_, index) => rows.slice(index * rowsPerPage, (index + 1) * rowsPerPage))
    : [[]];

  const renderRowsHtml = (pageRows: FlowTraceRow[]) =>
    pageRows
      .map(
        (row) => `
        <tr>
          <td>${escapeHtml(row.created_at)}</td>
          <td>${escapeHtml(formatBatchId(row.flow_batch_id))}</td>
          <td>${escapeHtml(row.outlet_name)}</td>
          <td>${escapeHtml(row.level)}</td>
          <td>${escapeHtml(row.item_name)}</td>
          <td>${escapeHtml(row.variant_label)}</td>
          <td>${escapeHtml(row.warehouse_name)}</td>
          <td>${formatQty(row.total_delta)}</td>
          <td>${row.available_units == null ? "-" : formatQty(row.available_units)}</td>
          <td>${row.negative ? "YES" : ""}</td>
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
        <title>Afterten Flow Trace Report</title>
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
            border: 2mm solid #1d4ed8;
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
            border: 2px solid #1d4ed8;
          }
          th, td {
            border-bottom: 1px solid #bfdbfe;
            padding: 9px 7px;
            font-size: 11px;
            text-align: center;
          }
          th {
            text-transform: uppercase;
            font-size: 10px;
            letter-spacing: 0.6px;
            color: #6b7280;
          }
          tbody tr:last-child td { border-bottom: none; }
          tfoot td {
            font-weight: 700;
            border-top: 2px solid #1d4ed8;
            background: rgba(29, 78, 216, 0.05);
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
            return `
        <div class="watermark"></div>
        <div class="page">
          <div class="content">
            <div class="header">
              ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="Afterten" />` : "<div></div>"}
              <div class="title">Flow Trace Report</div>
              <div></div>
            </div>
            <div class="subheader">
              <div><strong>Outlets:</strong> ${escapeHtml(outletText)}</div>
              <div><strong>Date range:</strong> ${escapeHtml(rangeText)}</div>
              ${timeText ? `<div><strong>Time range:</strong> ${escapeHtml(timeText)}</div>` : ""}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Batch</th>
                  <th>Outlet</th>
                  <th>Level</th>
                  <th>Item</th>
                  <th>Variant</th>
                  <th>Warehouse</th>
                  <th>Delta</th>
                  <th>Avail</th>
                  <th>Neg</th>
                </tr>
              </thead>
              <tbody>
                ${renderRowsHtml(pageRows)}
              </tbody>
            </table>
            <div class="totals">
              <div><div class="label">Traces</div><div class="value">${totals.count}</div></div>
              <div><div class="label">Negative</div><div class="value">${totals.negativeCount}</div></div>
              <div><div class="label">Total Delta</div><div class="value">${formatQty(totals.totalDelta)}</div></div>
            </div>
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
