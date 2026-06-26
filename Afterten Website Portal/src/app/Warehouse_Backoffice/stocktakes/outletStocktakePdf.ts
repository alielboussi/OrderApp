import { buildStocktakeVariancePdfHtml } from "../stock-reports/stocktakepdf";

type VarianceApiRow = {
  variant_label?: string | null;
  item_name: string | null;
  opening_qty: number | null;
  transfer_qty: number | null;
  damage_qty: number | null;
  sales_qty: number | null;
  closing_qty: number | null;
  expected_qty: number | null;
  variance_qty: number | null;
  variance_cost: number | null;
  variant_amount?: number | null;
};

export async function downloadVariancePdf(options: {
  periodId: string;
  warehouseLabel: string;
  periodLabel: string;
}) {
  const res = await fetch(`/api/stocktake-variance?period_id=${encodeURIComponent(options.periodId)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Unable to load variance for PDF");
  const json = await res.json();
  const rows = ((json.rows as VarianceApiRow[]) ?? []).map((row) => ({
    variant_label: row.variant_label ?? row.item_name ?? "Item",
    opening_qty: row.opening_qty ?? 0,
    transfer_qty: row.transfer_qty ?? 0,
    damage_qty: row.damage_qty ?? 0,
    sales_qty: row.sales_qty ?? 0,
    closing_qty: row.closing_qty ?? 0,
    expected_qty: row.expected_qty ?? 0,
    variance_qty: row.variance_qty ?? 0,
    variant_amount: row.variance_cost ?? row.variant_amount ?? 0,
  }));

  const html = buildStocktakeVariancePdfHtml({
    warehouseText: options.warehouseLabel,
    periodText: options.periodLabel,
    rows,
    includeSales: json.include_sales !== false,
  });

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument ?? frame.contentWindow?.document;
  if (!doc) throw new Error("Unable to render PDF");
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise<void>((resolve) => {
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => {
        frame.remove();
        resolve();
      }, 800);
    }, 400);
  });
}
