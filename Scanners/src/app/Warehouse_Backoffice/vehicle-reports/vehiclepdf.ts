type VehicleReportRow = {
  vehicle: string;
  plate: string;
  driver: string;
  item_name: string;
  variant_label: string;
  qty_units: number;
};

type VehicleReportPdfOptions = {
  rangeText: string;
  vehicleText: string;
  driverText: string;
  plateText: string;
  rows: VehicleReportRow[];
  totalQty: number;
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

export function buildVehicleReportPdfHtml(options: VehicleReportPdfOptions): string {
  const {
    rangeText,
    vehicleText,
    driverText,
    plateText,
    rows,
    totalQty,
    logoDataUrl,
    watermarkText = "Afterten Takeaway & Restaurant",
  } = options;

  const maxRowsPerPage = 24;
  const totalRows = rows.length;
  const pageCount = totalRows ? Math.ceil(totalRows / maxRowsPerPage) : 1;
  const rowChunks = totalRows
    ? Array.from({ length: pageCount }, (_, index) =>
        rows.slice(index * maxRowsPerPage, (index + 1) * maxRowsPerPage)
      )
    : [[]];

  const renderRowsHtml = (pageRows: VehicleReportRow[]) =>
    pageRows.length
      ? pageRows
          .map(
            (row) => `
        <tr>
          <td>${escapeHtml(row.vehicle)}</td>
          <td>${escapeHtml(row.plate)}</td>
          <td>${escapeHtml(row.driver)}</td>
          <td>${escapeHtml(row.item_name)}</td>
          <td>${escapeHtml(row.variant_label)}</td>
          <td class="right">${formatQty(row.qty_units)}</td>
        </tr>
      `
          )
          .join("")
      : `
        <tr>
          <td colspan="6">No transfers matched this filter.</td>
        </tr>
      `;

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
        <title>Afterten Vehicle Report</title>
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
            border: 2px solid #b91c1c;
          }
          th, td {
            border-bottom: 1px solid #f2b6b6;
            padding: 10px 8px;
            font-size: 12px;
            text-align: left;
          }
          th {
            text-transform: uppercase;
            font-size: 11px;
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
            grid-template-columns: repeat(2, 1fr);
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
          .right { text-align: right; }
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
            return `
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
              <div class="title">Vehicle Transfer Report</div>
              <div></div>
            </div>
            <div class="subheader">
              <div><strong>Date range:</strong> ${escapeHtml(rangeText)}</div>
              <div><strong>Vehicle:</strong> ${escapeHtml(vehicleText)}</div>
              <div><strong>Driver:</strong> ${escapeHtml(driverText)} · <strong>Plate:</strong> ${escapeHtml(plateText)}</div>
              <div><strong>Rows:</strong> ${rows.length.toLocaleString()}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Plate</th>
                  <th>Driver</th>
                  <th>Product</th>
                  <th>Variant</th>
                  <th class="right">Qty</th>
                </tr>
              </thead>
              <tbody>
                ${renderRowsHtml(pageRows)}
              </tbody>
              ${index === rowChunks.length - 1 ? `
              <tfoot>
                <tr>
                  <td colspan="5">Total</td>
                  <td class="right">${formatQty(totalQty)}</td>
                </tr>
              </tfoot>
              ` : ""}
            </table>
          </div>
          <div class="page-number">Page ${index + 1} of ${rowChunks.length}</div>
        </div>`;
          })
          .join("")}
      </body>
    </html>
  `;
}
