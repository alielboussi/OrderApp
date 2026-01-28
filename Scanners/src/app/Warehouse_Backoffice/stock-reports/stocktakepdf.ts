type VarianceRow = {
  item_name: string;
  variant_key: string | null;
  opening_qty: number;
  transfer_qty: number;
  damage_qty: number;
  sales_qty: number;
  closing_qty: number;
  expected_qty: number;
  variance_qty: number;
  variance_cost: number;
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
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildStocktakeVariancePdfHtml(options: StocktakePdfOptions): string {
  const { warehouseText, periodText, rows, logoDataUrl, watermarkText = "Afterten Takeaway & Restaurant" } = options;

  const totals = rows.reduce(
    (acc, row) => {
      acc.opening += row.opening_qty;
      acc.transfer += Math.abs(row.transfer_qty);
      acc.damage += Math.abs(row.damage_qty);
      acc.sales += Math.abs(row.sales_qty);
      acc.closing += row.closing_qty;
      acc.expected += row.expected_qty;
      acc.variance += row.variance_qty;
      acc.varianceCost += row.variance_cost;
      return acc;
    },
    { opening: 0, transfer: 0, damage: 0, sales: 0, closing: 0, expected: 0, variance: 0, varianceCost: 0 }
  );

  const rowsHtml = rows.length
    ? rows
        .map(
          (row) => `
        <tr>
          <td>${escapeHtml(row.item_name)}</td>
          <td>${escapeHtml(row.variant_key ?? "base")}</td>
          <td>${formatQty(row.opening_qty)}</td>
          <td>${formatQty(row.transfer_qty)}</td>
          <td>${formatQty(row.damage_qty)}</td>
          <td>${formatQty(row.sales_qty)}</td>
          <td>${formatQty(row.closing_qty)}</td>
          <td>${formatQty(row.expected_qty)}</td>
          <td>${formatQty(row.variance_qty)}</td>
          <td>${formatCurrency(row.variance_cost)}</td>
        </tr>
      `
        )
        .join("")
    : `
        <tr>
          <td colspan="10">No variance rows found for this period.</td>
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
        <title>Afterten Stocktake Variance</title>
        <style>
          @page { size: A4; margin: 12mm 8mm; }
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
          .content { position: relative; z-index: 1; }
          .header {
            display: grid;
            grid-template-columns: 80px 1fr 80px;
            align-items: center;
            gap: 16px;
            margin-bottom: 12px;
          }
          .logo { width: 80px; height: 80px; object-fit: contain; }
          .title {
            text-align: center;
            font-size: 20px;
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
          thead { display: table-header-group; }
          tfoot { display: table-row-group; }
          th, td {
            border-bottom: 1px solid #f2b6b6;
            padding: 10px 8px;
            font-size: 12px;
            text-align: center;
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
          .page-number {
            position: fixed;
            bottom: 8mm;
            right: 12mm;
            font-size: 10px;
            color: #374151;
          }
          table, tr, td, th { page-break-inside: avoid; }
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
                  <th>Item</th>
                  <th>Variant</th>
                  <th>Opening</th>
                  <th>Transfers</th>
                  <th>Damages</th>
                  <th>Sales</th>
                  <th>Closing</th>
                  <th>Expected</th>
                  <th>Variance</th>
                  <th>Variance Cost</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Totals</td>
                  <td>${formatQty(totals.opening)}</td>
                  <td>${formatQty(totals.transfer)}</td>
                  <td>${formatQty(totals.damage)}</td>
                  <td>${formatQty(totals.sales)}</td>
                  <td>${formatQty(totals.closing)}</td>
                  <td>${formatQty(totals.expected)}</td>
                  <td>${formatQty(totals.variance)}</td>
                  <td>${formatCurrency(totals.varianceCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div class="page-number"></div>
      </body>
    </html>
  `;
}
