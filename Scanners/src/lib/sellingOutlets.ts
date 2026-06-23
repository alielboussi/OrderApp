/** Shared client helpers — same outlet list as POS deductions / stocktakes / live balances. */

export type SellingOutlet = {
  id: string;
  name: string;
  code?: string | null;
  default_sales_warehouse_id?: string | null;
};

export type SellingOutletWarehouse = {
  outlet_id: string;
  outlet_name: string;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_scope?: string | null;
  display_name: string;
};

/** One row per selling outlet — same labels on POS deductions, stocktakes, and live balances. */
export type SellingOutletOption = {
  outlet_id: string;
  outlet_name: string;
  warehouse_id: string;
  warehouse_name: string;
  display_name: string;
};

export function groupSellingOutletWarehouses(
  links: SellingOutletWarehouse[],
  defaultWarehouseByOutlet?: Map<string, string | null | undefined>
): SellingOutletOption[] {
  const byOutlet = new Map<string, SellingOutletWarehouse[]>();
  for (const link of links) {
    const list = byOutlet.get(link.outlet_id) ?? [];
    list.push(link);
    byOutlet.set(link.outlet_id, list);
  }

  const options: SellingOutletOption[] = [];
  for (const rows of byOutlet.values()) {
    rows.sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name, undefined, { sensitivity: "base" }));
    const preferredId = defaultWarehouseByOutlet?.get(rows[0].outlet_id);
    const pick =
      (preferredId ? rows.find((row) => row.warehouse_id === preferredId) : undefined) ??
      rows.find((row) => row.warehouse_name.trim().toLowerCase() === rows[0].outlet_name.trim().toLowerCase()) ??
      rows[0];
    options.push({
      outlet_id: pick.outlet_id,
      outlet_name: pick.outlet_name,
      warehouse_id: pick.warehouse_id,
      warehouse_name: pick.warehouse_name,
      display_name: pick.outlet_name.trim() || "Outlet",
    });
  }

  return options.sort((a, b) =>
    a.outlet_name.localeCompare(b.outlet_name, undefined, { sensitivity: "base" })
  );
}

export async function fetchSellingOutlets(): Promise<SellingOutlet[]> {
  const res = await fetch("/api/outlets?scope=selling", { cache: "no-store" });
  if (!res.ok) throw new Error("Unable to load selling outlets");
  const json = await res.json();
  return (json.outlets as SellingOutlet[]) ?? [];
}

/** Active outlets for POS deduction programming (excludes Till 1, Till 2, Quick Corner). */
export async function fetchPosDeductionOutlets(): Promise<SellingOutlet[]> {
  const res = await fetch("/api/outlets?scope=pos-deductions", { cache: "no-store" });
  if (!res.ok) throw new Error("Unable to load outlets");
  const json = await res.json();
  return (json.outlets as SellingOutlet[]) ?? [];
}

export async function fetchSellingOutletWarehouses(outletId?: string): Promise<SellingOutletWarehouse[]> {
  const params = new URLSearchParams({ scope: "outlet" });
  if (outletId) params.set("outlet_id", outletId);
  const res = await fetch(`/api/outlet-warehouses?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Unable to load outlet warehouses");
  const json = await res.json();
  return (json.links as SellingOutletWarehouse[]) ?? [];
}

export async function fetchPosDeductionOutletWarehouses(outletId?: string): Promise<SellingOutletWarehouse[]> {
  const params = new URLSearchParams({ scope: "pos-deductions" });
  if (outletId) params.set("outlet_id", outletId);
  const res = await fetch(`/api/outlet-warehouses?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Unable to load outlet warehouses");
  const json = await res.json();
  return (json.links as SellingOutletWarehouse[]) ?? [];
}
