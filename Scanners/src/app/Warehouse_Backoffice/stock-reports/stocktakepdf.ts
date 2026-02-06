type VarianceRow = {
  variant_label: string;
  opening_qty: number;
  transfer_qty: number;
  damage_qty: number;
  sales_qty: number;
  closing_qty: number;
  expected_qty: number;
  variance_qty: number;
  variant_amount: number;
};

type StocktakePdfOptions = {
  warehouseText: string;
  periodText: string;
  rows: VarianceRow[];
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

function formatCurrency(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}K ${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function buildStocktakeVariancePdfHtml(options: StocktakePdfOptions): string {
  const { warehouseText, periodText, rows, logoDataUrl, watermarkText = "Afterten Takeaway & Restaurant Ltd" } = options;

  const totals = rows.reduce(
    (acc, row) => {
      acc.opening += row.opening_qty;
      acc.transfer += Math.abs(row.transfer_qty);
      acc.damage += Math.abs(row.damage_qty);
      acc.sales += Math.abs(row.sales_qty);
      acc.closing += row.closing_qty;
      acc.expected += row.expected_qty;
      acc.variance += row.variance_qty;
      acc.varianceCost += row.variant_amount;
      return acc;
    },
    { opening: 0, transfer: 0, damage: 0, sales: 0, closing: 0, expected: 0, variance: 0, varianceCost: 0 }
  );

  const rowsHtml = rows.length
    ? rows
        .map(
          (row) => `
        <tr>
          <td>${escapeHtml(row.variant_label)}</td>
          <td>${formatQty(row.opening_qty)}</td>
          <td>${formatQty(row.transfer_qty)}</td>
          <td>${formatQty(row.damage_qty)}</td>
          <td>${formatQty(row.sales_qty)}</td>
          <td>${formatQty(row.closing_qty)}</td>
          <td>${formatQty(row.expected_qty)}</td>
          <td>${formatQty(row.variance_qty)}</td>
          <td>${formatCurrency(row.variant_amount)}</td>
        </tr>
      `
        )
        .join("")
    : `
        <tr>
          <td colspan="9">No variance rows found for this period.</td>
        </tr>
      `;

  const watermarkSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='520' height='360'>
    <style>
      text { font-family: Arial, sans-serif; font-size: 20px; fill: #111827; }
    </style>
    <g transform='rotate(-28 260 180)'>
      <text x='-40' y='60'>${watermarkText}</text>
      <text x='-40' y='140'>${watermarkText}</text>
      <text x='-40' y='220'>${watermarkText}</text>
      <text x='-40' y='300'>${watermarkText}</text>
      <text x='220' y='100'>${watermarkText}</text>
      <text x='220' y='180'>${watermarkText}</text>
      <text x='220' y='260'>${watermarkText}</text>
    </g>
  </svg>`;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Afterten Stocktake Variance</title>
        <style>
          @page { size: A4; margin: 6mm 6mm; }
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
            border: 1.5mm solid #b91c1c;
            padding: 6mm 6mm 8mm;
          }
          .watermark {
            position: fixed;
            inset: 0;
            opacity: 0.12;
            z-index: 0;
            background-image: url("data:image/svg+xml;utf8,${encodeURIComponent(watermarkSvg)}");
            background-repeat: repeat;
            background-size: 520px 360px;
            pointer-events: none;
          }
          .content { position: relative; z-index: 1; }
          .header {
            display: grid;
            grid-template-columns: 64px 1fr 64px;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
          }
          .logo { width: 64px; height: 64px; object-fit: contain; }
          .title {
            text-align: center;
            font-size: 16px;
            font-weight: 700;
            letter-spacing: 0.4px;
          }
          .subheader {
            margin-top: 8px;
            margin-bottom: 8px;
            font-size: 11px;
            color: #374151;
            display: grid;
            gap: 4px;
            text-align: center;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
            border: 2px solid #b91c1c;
          }
          thead { display: table-header-group; }
          tfoot { display: table-row-group; }
          th, td {
            border: 1px solid #f2b6b6;
            padding: 6px 6px;
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
            border-top: 1px solid #f2b6b6;
            border-left: none;
            border-right: none;
            border-bottom: none;
            background: rgba(185, 28, 28, 0.05);
          }
          .footer {
            display: grid;
            gap: 14px;
            margin-top: 20mm;
            font-size: 10.5px;
            color: #111827;
            break-inside: avoid;
            justify-items: start;
          }
          .person-block {
            display: grid;
            gap: 6px;
            justify-items: start;
          }
          .name-row {
            display: flex;
            align-items: center;
            gap: 8px;
            justify-content: flex-start;
          }
          .name-line {
            width: 90px;
            border-bottom: 1px solid #b91c1c;
            height: 0.9em;
          }
          .signature-box {
            width: 1.8cm;
            height: 1.8cm;
            border: 1px solid #b91c1c;
          }
          .disclaimer {
            text-align: center;
            font-size: 10px;
            color: #374151;
            margin-top: 6px;
          }
          tr, td, th { page-break-inside: avoid; }
        </style>
      </head>
      <body>
        <div class="watermark"></div>
        <div class="page">
          <div class="content">
            <div class="header">
              ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="Afterten" />` : "<div></div>"}
              <div class="title">Stocktake Variance Report</div>
              <div></div>
            </div>
            <div class="subheader">
              <div><strong>Warehouse:</strong> ${escapeHtml(warehouseText)}</div>
              <div><strong>Period:</strong> ${escapeHtml(periodText)}</div>
              <div><strong>Rows:</strong> ${rows.length.toLocaleString()}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Variant</th>
                  <th>Opening</th>
                  <th>Transfers</th>
                  <th>Damages</th>
                  <th>Sales</th>
                  <th>Closing</th>
                  <th>Expected</th>
                  <th>Variance</th>
                  <th>Variant Amount</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
              <tfoot>
                <tr>
                  <td>Totals</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td>${formatCurrency(totals.varianceCost)}</td>
                </tr>
              </tfoot>
            </table>
            <div class="footer">
              <div class="person-block">
                <div class="name-row"><span>Managers Name:</span><span class="name-line"></span></div>
                <div class="signature-box"></div>
              </div>
              <div class="person-block">
                <div class="name-row"><span>Stocktaker's Name:</span><span class="name-line"></span></div>
                <div class="signature-box"></div>
              </div>
            </div>
            <div class="disclaimer">P.S “The above signatures state that the provided data is accurate and valid.”</div>
          </div>
        </div>
      </body>
    </html>
  `;
}
