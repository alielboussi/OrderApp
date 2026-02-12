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
  const { warehouseText, periodText, rows, logoDataUrl } = options;
  const rowChunks = [rows];

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

  const renderRowsHtml = (pageRows: VarianceRow[]) =>
    pageRows.length
      ? pageRows
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
            min-height: 277mm;
            display: flex;
            flex-direction: column;
            page-break-after: always;
          }
          .page:last-child { page-break-after: auto; }
          .content {
            position: relative;
            z-index: 1;
            display: flex;
            flex-direction: column;
            min-height: 100%;
          }
          .table-wrap {
            background: #fff;
            padding: 2mm;
            border-radius: 2mm;
          }
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
          .page-number {
            position: absolute;
            right: 6mm;
            bottom: 4mm;
            font-size: 10px;
            color: #6b7280;
          }
          tr, td, th { page-break-inside: avoid; }
        </style>
      </head>
      <body>
        ${rowChunks
          .map((pageRows, index) => {
            const isLastPage = index === rowChunks.length - 1;
            return `
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
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
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
                  ${renderRowsHtml(pageRows)}
                </tbody>
                ${isLastPage ? `
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
                ` : ""}
              </table>
            </div>
          </div>
          <div class="page-number">Page ${index + 1} of ${rowChunks.length}</div>
        </div>`;
          })
          .join("")}
      </body>
    </html>
  `;
}
