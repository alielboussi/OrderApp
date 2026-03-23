type ColdroomReportRow = {
  item_label: string;
  variant_label: string;
  item_kind: string;
  accrued_units: number;
};

type ColdroomReportPdfOptions = {
  warehouseText: string;
  periodText: string;
  rows: ColdroomReportRow[];
  logoDataUrl?: string;
  totalsLabel?: string;
  childTotals?: Array<{ label: string; total: number }>;
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

export function buildColdroomReportPdfHtml(options: ColdroomReportPdfOptions): string {
  const { warehouseText, periodText, rows, logoDataUrl, totalsLabel, childTotals } = options;
  const rowChunks = [rows];

  const totals = rows.reduce((sum, row) => sum + row.accrued_units, 0);

  const renderRowsHtml = (pageRows: ColdroomReportRow[]) =>
    pageRows.length
      ? pageRows
          .map(
            (row) => `
        <tr>
          <td>${escapeHtml(row.item_label)}</td>
          <td>${escapeHtml(row.variant_label)}</td>
          <td>${escapeHtml(row.item_kind)}</td>
          <td>${formatQty(row.accrued_units)}</td>
        </tr>
      `
          )
          .join("")
      : `
        <tr>
          <td colspan="4">No rows found for this report.</td>
        </tr>
      `;

  const childTotalsHtml = (childTotals ?? [])
    .filter((entry) => Math.abs(entry.total) > 0)
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.label)}</td>
        <td></td>
        <td></td>
        <td>${formatQty(entry.total)}</td>
      </tr>
    `
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Afterten Coldroom Report</title>
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
              <div class="title">Coldroom Accrued Report</div>
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
                    <th>Variant</th>
                    <th>Kind</th>
                    <th>Accrued Units</th>
                  </tr>
                </thead>
                <tbody>
                  ${renderRowsHtml(pageRows)}
                </tbody>
                ${isLastPage ? `
                <tfoot>
                  ${childTotalsHtml}
                  <tr>
                    <td>${escapeHtml(totalsLabel ?? "Total")}</td>
                    <td></td>
                    <td></td>
                    <td>${formatQty(totals)}</td>
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
