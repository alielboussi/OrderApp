import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

function parseQty(value: number | null): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return value;
}

function normalizeVariantKey(value?: string | null): string {
  const raw = (value ?? "").trim().toLowerCase();
  return raw.length ? raw : "base";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("period_id");

  if (!periodId) {
    return NextResponse.json({ error: "period_id is required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: periodRow, error: periodError } = await supabase
    .from("warehouse_stock_periods")
    .select("id,warehouse_id,opened_at,closed_at,stocktake_number")
    .eq("id", periodId)
    .maybeSingle();

  if (periodError) {
    return NextResponse.json({ error: periodError.message }, { status: 500 });
  }

  if (!periodRow?.warehouse_id || !periodRow?.opened_at) {
    return NextResponse.json({ error: "Stock period not found." }, { status: 404 });
  }

  const openedAt = periodRow.opened_at;
  const closedAt = periodRow.closed_at ?? new Date().toISOString();
  const warehouseId = periodRow.warehouse_id;

  const { data: countRows, error: countError } = await supabase
    .from("warehouse_stock_counts")
    .select("item_id,variant_key,counted_qty,kind")
    .eq("period_id", periodId)
    .in("kind", ["opening", "closing"]);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const toKey = (itemId: string, variantKey?: string | null) => `${itemId}::${normalizeVariantKey(variantKey)}`;

  const openingMap = new Map<string, number>();
  const closingMap = new Map<string, number>();

  (countRows ?? []).forEach((row) => {
    if (!row?.item_id) return;
    const key = toKey(row.item_id, row.variant_key);
    const qty = parseQty(row.counted_qty);
    if (row.kind === "opening") {
      openingMap.set(key, qty);
    } else if (row.kind === "closing") {
      closingMap.set(key, qty);
    }
  });

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("stock_ledger")
    .select("item_id,variant_key,delta_units,reason,occurred_at")
    .eq("location_type", "warehouse")
    .eq("warehouse_id", warehouseId)
    .gte("occurred_at", openedAt)
    .lte("occurred_at", closedAt)
    .in("reason", ["warehouse_transfer", "damage", "outlet_sale", "recipe_consumption"]);

  if (ledgerError) {
    return NextResponse.json({ error: ledgerError.message }, { status: 500 });
  }

  const transferMap = new Map<string, number>();
  const damageMap = new Map<string, number>();
  const salesMap = new Map<string, number>();

  (ledgerRows ?? []).forEach((row) => {
    if (!row?.item_id) return;
    const key = toKey(row.item_id, row.variant_key);
    const delta = parseQty(row.delta_units);
    if (row.reason === "warehouse_transfer") {
      transferMap.set(key, (transferMap.get(key) ?? 0) + delta);
    } else if (row.reason === "damage") {
      damageMap.set(key, (damageMap.get(key) ?? 0) + delta);
    } else if (row.reason === "outlet_sale") {
      salesMap.set(key, (salesMap.get(key) ?? 0) + delta);
    }
  });

  const keys = new Set<string>([
    ...openingMap.keys(),
    ...closingMap.keys(),
    ...transferMap.keys(),
    ...damageMap.keys(),
    ...salesMap.keys(),
  ]);

  const itemIds = Array.from(new Set(Array.from(keys).map((key) => key.split("::")[0])));

  const { data: itemRows, error: itemError } = await supabase
    .from("catalog_items")
    .select("id,name,cost,item_kind")
    .in("id", itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"]);

  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  const itemMap = new Map<string, { name: string | null; cost: number; item_kind: string | null }>();
  (itemRows ?? []).forEach((row) => {
    if (!row?.id) return;
    const cost = parseQty(row.cost);
    itemMap.set(row.id, { name: row.name ?? null, cost, item_kind: row.item_kind ?? null });
  });

  const { data: variantRows, error: variantError } = await supabase
    .from("catalog_variants")
    .select("id,item_id,name,cost,active")
    .in("item_id", itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"]);

  if (variantError) {
    return NextResponse.json({ error: variantError.message }, { status: 500 });
  }

  const variantMap = new Map<string, { name: string | null; cost: number }>();
  (variantRows ?? []).forEach((row) => {
    if (!row?.id || !row?.item_id) return;
    if (row.active === false) return;
    const key = `${row.item_id}::${normalizeVariantKey(row.id)}`;
    variantMap.set(key, { name: row.name ?? null, cost: parseQty(row.cost) });
  });

  const rows = Array.from(keys)
    .map((key) => {
      const [itemId, variantKeyRaw] = key.split("::");
      const openingQty = openingMap.get(key) ?? 0;
      const closingQty = closingMap.get(key) ?? 0;
      const transferQty = transferMap.get(key) ?? 0;
      const damageQty = damageMap.get(key) ?? 0;
      const salesQty = salesMap.get(key) ?? 0;
      const expectedQty = openingQty + transferQty + damageQty + salesQty;
      const varianceQty = closingQty - expectedQty;
      const itemName = itemMap.get(itemId)?.name ?? itemId;
      const itemKind = itemMap.get(itemId)?.item_kind ?? null;
      const variantKey = normalizeVariantKey(variantKeyRaw);
      const variantInfo = variantMap.get(`${itemId}::${variantKey}`);
      const isVariant = variantKey !== "base" && !!variantInfo;
      const variantName = variantKey === "base" ? itemName : variantInfo?.name ?? variantKey;
      const variantLabel = variantKey === "base" ? itemName : `${itemName} - ${variantName}`;
      const unitCost = variantInfo?.cost ?? itemMap.get(itemId)?.cost ?? 0;
      const hasActivity = [openingQty, transferQty, damageQty, salesQty, closingQty].some(
        (value) => Math.abs(value) > 0.0000001
      );
      if (!hasActivity) return null;
      return {
        item_id: itemId,
        item_name: itemName,
        item_kind: itemKind,
        variant_key: variantKey,
        is_variant: isVariant,
        variant_name: variantName,
        variant_label: variantLabel,
        opening_qty: openingQty,
        transfer_qty: transferQty,
        damage_qty: damageQty,
        sales_qty: salesQty,
        closing_qty: closingQty,
        expected_qty: expectedQty,
        variance_qty: varianceQty,
        unit_cost: unitCost,
        variance_cost: varianceQty * unitCost,
        variant_amount: varianceQty * unitCost,
      };
    })
    .filter((row) => row !== null)
    .sort((a, b) => (a!.variant_label ?? "").localeCompare(b!.variant_label ?? ""));

  return NextResponse.json({
    period: {
      id: periodRow.id,
      opened_at: periodRow.opened_at,
      closed_at: periodRow.closed_at,
      stocktake_number: periodRow.stocktake_number,
      warehouse_id: periodRow.warehouse_id,
    },
    rows,
  });
}
