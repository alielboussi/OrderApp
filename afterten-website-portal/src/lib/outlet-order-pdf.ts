import { formatOrdersAppUom } from "./orders-app-uom";
import type { UomOption } from "@/lib/catalog-uom-fields";

export type OutletOrderPdfItem = {
  name: string;
  productId?: string | null;
  variantKey?: string | null;
  productName?: string | null;
  qty: number;
  uom: string;
  cost: number;
  amount: number;
};

export type OutletOrderPdfSignature = {
  role: "employee" | "driver" | "offloader";
  name: string;
  signedAt?: string;
  dataUrl?: string;
};

type PdfLine = {
  label: string;
  displayLabel: string;
  productName: string;
  showAsVariant: boolean;
  qty: number;
  uom: string;
  cost: number;
  amount: number;
};

type PdfProductGroup = {
  productId: string;
  productName: string;
  lines: PdfLine[];
};

type PdfTableRow =
  | { kind: "header"; productName: string }
  | {
      kind: "line";
      label: string;
      qty: number;
      uom: string;
      cost: number;
      amount: number;
    }
  | { kind: "total"; qty: number; amount: number };

const SIGNATURE_LABELS: Record<OutletOrderPdfSignature["role"], string> = {
  employee: "Outlet Order Placed By",
  driver: "Order Delivered By",
  offloader: "Delivery Offloader At Outlet By",
};

const ROWS_PER_TABLE_PAGE = 24;
const SIGNATURES_ON_NEW_PAGE_THRESHOLD = 16;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatOutletOrderMoney(value: number): string {
  if (!Number.isFinite(value)) return "K 0";
  return `K ${Math.round(value).toLocaleString("en-US")}`;
}

export function buildOutletOrderPdfFilename(options: {
  outletName: string;
  createdAt?: string | Date | null;
  orderNumber: string;
}): string {
  const outlet = sanitizeFilenamePart(options.outletName);
  const stamp = formatFilenameStamp(options.createdAt);
  const orderNumber = sanitizeFilenamePart(options.orderNumber);
  return `${outlet}_${stamp}_${orderNumber}.pdf`;
}

function sanitizeFilenamePart(value: string): string {
  return (
    value
      .trim()
      .replace(/[^\w\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "") || "order"
  );
}

function formatFilenameStamp(value?: string | Date | null): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "unknown_date";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function productBaseName(name: string): string {
  const trimmed = name.trim();
  const separator = trimmed.indexOf(" - ");
  return separator > 0 ? trimmed.slice(0, separator) : trimmed;
}

function resolveVariantDisplayLabel(baseName: string, fullName: string): string {
  const base = baseName.trim();
  const full = fullName.trim();
  if (!full) return "";
  if (!base) return full;
  if (full.toLowerCase() === base.toLowerCase()) return full;

  const dashPrefix = `${base} - `;
  if (full.startsWith(dashPrefix)) return full.slice(dashPrefix.length).trim();

  if (full.toLowerCase().startsWith(base.toLowerCase())) {
    const remainder = full.slice(base.length).trim();
    if (remainder) return remainder;
  }

  return full;
}

function groupPdfItems(items: OutletOrderPdfItem[]): PdfProductGroup[] {
  const groups = new Map<string, PdfProductGroup>();

  for (const item of items) {
    const label = item.name.trim() || "Item";
    const key = item.productId?.trim() || label;
    const resolvedBaseName = item.productName?.trim() || productBaseName(label);
    const variantKey = item.variantKey?.trim() ?? "";
    const showAsVariant =
      Boolean(variantKey) ||
      (Boolean(resolvedBaseName) && label.toLowerCase() !== resolvedBaseName.toLowerCase());

    const group =
      groups.get(key) ??
      ({
        productId: key,
        productName: resolvedBaseName || label,
        lines: [],
      } satisfies PdfProductGroup);

    if (resolvedBaseName) group.productName = resolvedBaseName;

    group.lines.push({
      label,
      displayLabel: resolveVariantDisplayLabel(group.productName, label),
      productName: group.productName,
      showAsVariant,
      qty: item.qty,
      uom: item.uom,
      cost: item.cost,
      amount: item.amount,
    });
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const productName =
        group.productName.trim() ||
        group.lines.find((line) => line.productName.trim())?.productName.trim() ||
        productBaseName(group.lines[0]?.label ?? "") ||
        group.lines[0]?.label ||
        "Item";
      return {
        ...group,
        productName,
        lines: [...group.lines]
          .map((line) => ({
            ...line,
            productName,
            displayLabel: resolveVariantDisplayLabel(productName, line.label),
            showAsVariant:
              line.showAsVariant ||
              (Boolean(productName) && line.label.toLowerCase() !== productName.toLowerCase()),
          }))
          .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" })),
      };
    })
    .sort((left, right) =>
      left.productName.localeCompare(right.productName, undefined, { sensitivity: "base" }),
    );
}

function groupHasVariants(group: PdfProductGroup): boolean {
  return group.lines.some((line) => line.showAsVariant);
}

function buildTableRows(
  groups: PdfProductGroup[],
  totalQty: number,
  totalAmount: number,
  uomCatalog?: ReadonlyArray<UomOption>,
): PdfTableRow[] {
  const rows: PdfTableRow[] = [];

  for (const group of groups) {
    const hasVariants = groupHasVariants(group);

    if (hasVariants) {
      rows.push({ kind: "header", productName: group.productName });
      for (const line of group.lines) {
        rows.push({
          kind: "line",
          label: line.showAsVariant ? line.displayLabel : line.label,
          qty: line.qty,
          uom: formatOrdersAppUom(line.uom, line.qty, uomCatalog),
          cost: line.cost,
          amount: line.amount,
        });
      }
      continue;
    }

    for (const line of group.lines) {
      rows.push({
        kind: "line",
        label: line.label,
        qty: line.qty,
        uom: formatOrdersAppUom(line.uom, line.qty, uomCatalog),
        cost: line.cost,
        amount: line.amount,
      });
    }
  }

  rows.push({ kind: "total", qty: totalQty, amount: totalAmount });
  return rows;
}

function renderTableRow(row: PdfTableRow): string {
  if (row.kind === "header") {
    return `
      <tr class="product-header">
        <td class="item-name">${escapeHtml(row.productName)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `;
  }

  if (row.kind === "total") {
    return `
      <tr class="total-row">
        <td>Total</td>
        <td>${formatQty(row.qty)}</td>
        <td></td>
        <td></td>
        <td>${formatOutletOrderMoney(row.amount)}</td>
      </tr>
    `;
  }

  return `
    <tr>
      <td class="item-name">${escapeHtml(row.label)}</td>
      <td>${formatQty(row.qty)}</td>
      <td>${escapeHtml(row.uom)}</td>
      <td>${formatOutletOrderMoney(row.cost)}</td>
      <td>${formatOutletOrderMoney(row.amount)}</td>
    </tr>
  `;
}

function renderSignatureBlock(sig: OutletOrderPdfSignature): string {
  const heading = `${SIGNATURE_LABELS[sig.role]} : ${sig.name || "-"}`;
  return `
    <div class="signature-block">
      <div class="signature-heading">${escapeHtml(heading)}</div>
      ${sig.signedAt ? `<div class="signature-date">${escapeHtml(sig.signedAt)}</div>` : ""}
      <div class="signature-box">
        ${sig.dataUrl ? `<img src="${sig.dataUrl}" alt="${escapeHtml(heading)}" />` : "<span>—</span>"}
      </div>
    </div>
  `;
}

function renderSignatureGrid(signatures: OutletOrderPdfSignature[]): string {
  const visible = signatures.filter((sig) => sig.name || sig.dataUrl);
  if (visible.length === 0) return "";

  const employee = visible.find((sig) => sig.role === "employee");
  const driver = visible.find((sig) => sig.role === "driver");
  const offloader = visible.find((sig) => sig.role === "offloader");
  const topBlocks = [employee, driver]
    .filter((sig): sig is OutletOrderPdfSignature => Boolean(sig))
    .map(renderSignatureBlock)
    .join("");
  const offloaderBlock = offloader ? renderSignatureBlock(offloader) : "";

  return `
    <div class="signature-grid">
      ${topBlocks ? `<div class="signature-row-top">${topBlocks}</div>` : ""}
      ${offloaderBlock ? `<div class="signature-row-bottom">${offloaderBlock}</div>` : ""}
    </div>
  `;
}

function buildBarcodeTape(orderNumber: string, repeats = 40): string {
  const token = String(orderNumber || "ORDER").replace(/\s+/g, "").toUpperCase();
  return Array.from({ length: repeats }, () => token).join(" ");
}

function renderBarcodeStrip(options: {
  barcodeTape: string;
  pageIndex: number;
  segmentHeightMm: number;
}): string {
  const offsetMm = options.pageIndex * options.segmentHeightMm;
  return `
    <div class="barcode-gutter" aria-hidden="true">
      <div class="barcode-text" style="transform: translateY(-${offsetMm}mm);">
        ${escapeHtml(options.barcodeTape)}
      </div>
    </div>
  `;
}

function renderDocumentHeader(options: {
  logoDataUrl?: string;
  outletName: string;
  orderNumber: string;
  orderId?: string;
  status: string;
  createdAt: string;
  placedBy: string;
  showMeta: boolean;
}): string {
  if (!options.showMeta) return "";

  return `
    <div class="header">
      ${options.logoDataUrl ? `<img class="logo" src="${options.logoDataUrl}" alt="Afterten" />` : "<div></div>"}
      <div class="title">Outlet Order Details</div>
      <div></div>
    </div>
    <div class="subheader">
      <div><strong>Outlet:</strong> ${escapeHtml(options.outletName)}</div>
      <div><strong>Order #:</strong> ${escapeHtml(options.orderNumber)} · <strong>Status:</strong> ${escapeHtml(options.status)}</div>
      ${options.orderId ? `<div><strong>Order ID:</strong> ${escapeHtml(options.orderId)}</div>` : ""}
      <div><strong>Created:</strong> ${escapeHtml(options.createdAt)} · <strong>Placed By:</strong> ${escapeHtml(options.placedBy)}</div>
    </div>
  `;
}

function renderTableShell(bodyRowsHtml: string): string {
  return `
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>UOM</th>
          <th>Price</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRowsHtml || `<tr><td colspan="5">No items found.</td></tr>`}
      </tbody>
    </table>
  `;
}

export function buildOutletOrderPdfHtml(options: {
  logoDataUrl?: string;
  outletName: string;
  orderNumber: string;
  orderId?: string;
  status: string;
  createdAt: string;
  placedBy: string;
  items: OutletOrderPdfItem[];
  signatures: OutletOrderPdfSignature[];
  totalQty: number;
  totalAmount: number;
  downloadFilename?: string;
  uomCatalog?: ReadonlyArray<UomOption>;
}): string {
  const {
    logoDataUrl,
    outletName,
    orderNumber,
    orderId,
    status,
    createdAt,
    placedBy,
    items,
    signatures,
    totalQty,
    totalAmount,
    downloadFilename,
    uomCatalog,
  } = options;

  const groups = groupPdfItems(items);
  const tableRows = buildTableRows(groups, totalQty, totalAmount, uomCatalog);
  const dataRows = tableRows.filter((row) => row.kind !== "total");
  const totalRow = tableRows.find((row) => row.kind === "total");
  const barcodeTape = buildBarcodeTape(orderNumber);
  const barcodeSegmentHeightMm = 250;

  const tableChunks: PdfTableRow[][] = [];
  if (dataRows.length === 0) {
    tableChunks.push(totalRow ? [totalRow] : []);
  } else {
    for (let index = 0; index < dataRows.length; index += ROWS_PER_TABLE_PAGE) {
      const chunk: PdfTableRow[] = dataRows.slice(index, index + ROWS_PER_TABLE_PAGE);
      if (index + ROWS_PER_TABLE_PAGE >= dataRows.length && totalRow) {
        chunk.push(totalRow);
      }
      tableChunks.push(chunk);
    }
    if (tableChunks.length === 0) {
      tableChunks.push(totalRow ? [totalRow] : []);
    } else {
      const lastChunk = tableChunks[tableChunks.length - 1];
      if (totalRow && !lastChunk.some((row) => row.kind === "total")) {
        tableChunks.push([totalRow]);
      }
    }
  }

  const signatureBlocks = renderSignatureGrid(signatures);

  const lastTableChunk = tableChunks[tableChunks.length - 1] ?? [];
  const signaturesOnSeparatePage =
    Boolean(signatureBlocks) &&
    (tableChunks.length > 1 || lastTableChunk.length > SIGNATURES_ON_NEW_PAGE_THRESHOLD);

  const contentPageCount = tableChunks.length + (signaturesOnSeparatePage ? 1 : 0);
  const totalPages = Math.max(contentPageCount, 1);

  const tablePagesHtml = tableChunks
    .map((chunk, index) => {
      const pageNumber = index + 1;
      const signaturesHtml =
        !signaturesOnSeparatePage && index === tableChunks.length - 1 && signatureBlocks
          ? signatureBlocks
          : "";

      return `
        <div class="page">
          ${renderBarcodeStrip({ barcodeTape, pageIndex: pageNumber - 1, segmentHeightMm: barcodeSegmentHeightMm })}
          <div class="page-content">
            ${renderDocumentHeader({
              logoDataUrl,
              outletName,
              orderNumber,
              orderId,
              status,
              createdAt,
              placedBy,
              showMeta: index === 0,
            })}
            ${renderTableShell(chunk.map(renderTableRow).join(""))}
            ${signaturesHtml}
          </div>
          <div class="page-number">${pageNumber} of ${totalPages}</div>
        </div>
      `;
    })
    .join("");

  const signaturePageHtml =
    signaturesOnSeparatePage && signatureBlocks
      ? `
        <div class="page signature-page">
          ${renderBarcodeStrip({
            barcodeTape,
            pageIndex: tableChunks.length,
            segmentHeightMm: barcodeSegmentHeightMm,
          })}
          <div class="page-content">
            ${renderSignatureGrid(signatures)}
          </div>
          <div class="page-number">${totalPages} of ${totalPages}</div>
        </div>
      `
      : "";

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(downloadFilename ?? `Outlet Order ${orderNumber}`)}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128+Text&display=swap" rel="stylesheet" />
        <style>
          @page { size: A4 portrait; margin: 0; }
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
            margin: 0;
            padding: 6mm 6mm 10mm 14mm;
            min-height: 297mm;
            page-break-after: always;
          }
          .page:last-child { page-break-after: auto; }
          .page-content {
            position: relative;
            z-index: 1;
          }
          .barcode-gutter {
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 12mm;
            overflow: hidden;
            border-right: 0.4mm solid #d1d5db;
            background: #fff;
            z-index: 2;
          }
          .barcode-text {
            position: absolute;
            left: 50%;
            top: 0;
            transform-origin: top center;
            writing-mode: vertical-rl;
            text-orientation: mixed;
            font-family: "Libre Barcode 128 Text", monospace;
            font-size: 34px;
            line-height: 1;
            letter-spacing: 1px;
            color: #111827;
            white-space: nowrap;
            padding: 4mm 0;
          }
          .header {
            display: grid;
            grid-template-columns: 96px 1fr 96px;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
          }
          .logo { width: 96px; height: 96px; object-fit: contain; }
          .title {
            text-align: center;
            font-size: 16px;
            font-weight: 700;
            letter-spacing: 0.4px;
          }
          .subheader {
            display: grid;
            gap: 4px;
            text-align: center;
            font-size: 11px;
            color: #374151;
            margin-bottom: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
            border: 2px solid #b91c1c;
          }
          th, td {
            border: 1px solid #f2b6b6;
            padding: 6px;
            font-size: 10.5px;
            text-align: center;
            vertical-align: middle;
          }
          th {
            text-transform: uppercase;
            font-size: 9.5px;
            letter-spacing: 0.6px;
            color: #6b7280;
          }
          td.item-name { text-align: center; }
          tr.product-header td {
            background: rgba(185, 28, 28, 0.08);
            font-weight: 700;
            text-align: center;
            color: #111827;
            border-top: 1px solid #b91c1c;
          }
          tr.total-row td {
            font-weight: 700;
            background: rgba(185, 28, 28, 0.05);
          }
          .signature-page .signature-grid {
            margin-top: 24mm;
          }
          .signature-grid {
            margin-top: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            page-break-inside: avoid;
          }
          .signature-row-top {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }
          .signature-row-bottom {
            display: flex;
            justify-content: center;
          }
          .signature-row-bottom .signature-block {
            width: calc(50% - 6px);
          }
          .signature-block {
            border: 1px solid #f2b6b6;
            padding: 8px;
            border-radius: 8px;
            page-break-inside: avoid;
          }
          .signature-heading {
            font-size: 10.5px;
            font-weight: 700;
            color: #111827;
          }
          .signature-date {
            font-size: 10px;
            color: #374151;
            margin-top: 4px;
          }
          .signature-box {
            border: 1px solid #b91c1c;
            border-radius: 6px;
            min-height: 70px;
            margin-top: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fff;
          }
          .signature-box img {
            max-height: 64px;
            max-width: 100%;
            object-fit: contain;
          }
          .page-number {
            position: absolute;
            right: 10mm;
            bottom: 5mm;
            font-size: 10px;
            color: #374151;
          }
          tr { page-break-inside: avoid; }
        </style>
      </head>
      <body>
        ${tablePagesHtml}
        ${signaturePageHtml}
      </body>
    </html>
  `;
}
