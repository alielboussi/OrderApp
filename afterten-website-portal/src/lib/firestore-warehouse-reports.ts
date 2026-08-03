import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";

function normalizeVariantKey(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length ? trimmed : "base";
}

function makeKey(itemId: string, variantKey?: string | null): string {
  return `${itemId}::${normalizeVariantKey(variantKey)}`;
}

export async function listFirestoreWarehouseReportItems(options: {
  warehouseId: string;
  search?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<{ rows: Array<Record<string, unknown>>; warning?: string }> {
  if (options.startDate || options.endDate) {
    return {
      rows: [],
      warning: "Date-filtered warehouse movement reports require stock_ledger migration to Firestore.",
    };
  }

  const db = getFirestoreDb();
  const search = options.search?.trim().toLowerCase() || "";
  const snapshot = await db.collection("warehouse_live_items").get();

  const itemsByKey = new Map<
    string,
    { item_id: string; item_name: string; variant_key: string; item_kind: string; total_units: number }
  >();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const warehouseId = typeof data.warehouseId === "string" ? data.warehouseId : data.warehouse_id;
    if (warehouseId !== options.warehouseId) continue;

    const itemId = typeof data.itemId === "string" ? data.itemId : data.item_id;
    if (!itemId) continue;

    const itemName =
      typeof data.itemName === "string"
        ? data.itemName
        : typeof data.item_name === "string"
          ? data.item_name
          : "Item";
    if (search && !itemName.toLowerCase().includes(search)) continue;

    const variantKey = normalizeVariantKey(
      typeof data.variantKey === "string" ? data.variantKey : data.variant_key,
    );
    const key = makeKey(itemId, variantKey);
    const netUnits = Number(data.netUnits ?? data.net_units ?? 0);
    const kind = typeof data.itemKind === "string" ? data.itemKind : data.item_kind ?? "unknown";

    const existing = itemsByKey.get(key);
    if (existing) {
      existing.total_units += Number.isFinite(netUnits) ? netUnits : 0;
    } else {
      itemsByKey.set(key, {
        item_id: itemId,
        item_name: itemName,
        variant_key: variantKey,
        item_kind: kind,
        total_units: Number.isFinite(netUnits) ? netUnits : 0,
      });
    }
  }

  const rows = Array.from(itemsByKey.values()).sort(
    (a, b) => a.item_name.localeCompare(b.item_name) || a.variant_key.localeCompare(b.variant_key),
  );

  return { rows };
}
