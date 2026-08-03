import "server-only";

import { getFirestoreDb } from "@/lib/firebase-server";

export type WarehouseLiveItemRow = {
  warehouse_id: string;
  warehouse_name: string;
  item_id: string;
  item_name: string | null;
  variant_key: string;
  net_units: number;
  item_kind: string | null;
};

function normalizeVariantKey(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length ? trimmed : "base";
}

export async function listFirestoreWarehouseLiveItems(options: {
  warehouseIds: string[];
  kinds: string[];
  search?: string | null;
  baseOnly?: boolean;
  itemsWithVariants?: Set<string>;
}): Promise<WarehouseLiveItemRow[]> {
  const db = getFirestoreDb();
  const warehouseSet = new Set(options.warehouseIds);
  const snapshot = await db.collection("warehouse_live_items").get();

  const warehouseNames = new Map<string, string>();
  if (warehouseSet.size > 0) {
    const warehousesSnap = await db.collection("warehouses").get();
    for (const doc of warehousesSnap.docs) {
      if (!warehouseSet.has(doc.id)) continue;
      const name = doc.data().name;
      warehouseNames.set(doc.id, typeof name === "string" && name.trim() ? name.trim() : doc.id);
    }
  }

  const map = new Map<string, WarehouseLiveItemRow>();
  const search = options.search?.trim().toLowerCase() || "";

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const warehouseId = typeof data.warehouseId === "string" ? data.warehouseId : data.warehouse_id;
    const itemId = typeof data.itemId === "string" ? data.itemId : data.item_id;
    if (!warehouseId || !itemId || !warehouseSet.has(warehouseId)) continue;

    const kind = typeof data.itemKind === "string" ? data.itemKind : data.item_kind ?? "";
    if (!options.kinds.includes(kind)) continue;

    const itemName =
      typeof data.itemName === "string" ? data.itemName : typeof data.item_name === "string" ? data.item_name : null;
    if (search && !(itemName ?? "").toLowerCase().includes(search)) continue;

    const vKey = normalizeVariantKey(
      typeof data.variantKey === "string" ? data.variantKey : data.variant_key,
    ).toLowerCase();
    if (options.baseOnly && vKey !== "base") continue;
    if (vKey === "base" && options.itemsWithVariants?.has(itemId)) continue;

    const onHand = Number(data.netUnits ?? data.net_units ?? 0);
    const key = `${warehouseId}::${itemId}::${vKey}`;
    const existing = map.get(key);
    if (existing) {
      existing.net_units += Number.isFinite(onHand) ? onHand : 0;
    } else {
      map.set(key, {
        warehouse_id: warehouseId,
        warehouse_name: warehouseNames.get(warehouseId) ?? warehouseId,
        item_id: itemId,
        item_name: itemName,
        variant_key: normalizeVariantKey(
          typeof data.variantKey === "string" ? data.variantKey : data.variant_key,
        ),
        net_units: Number.isFinite(onHand) ? onHand : 0,
        item_kind: kind || null,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const warehouseCompare = a.warehouse_name.localeCompare(b.warehouse_name);
    if (warehouseCompare !== 0) return warehouseCompare;
    return (a.item_name ?? "").localeCompare(b.item_name ?? "");
  });
}
