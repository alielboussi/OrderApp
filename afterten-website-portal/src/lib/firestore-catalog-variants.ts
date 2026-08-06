import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  VARIANT_TRACKED_FIELDS,
  parseCatalogChangeActor,
  recordCatalogChange,
} from "@/lib/catalog-change-events";
import { allocateFirestorePosVariantSku } from "@/lib/firestore-pos-catalog-ids";
import {
  buildStorageHomeIds,
  createFirestoreCatalogVariant,
  deleteFirestoreCatalogVariant,
  enrichFirestoreVariants,
  getFirestoreCatalogItem,
  getFirestoreCatalogVariant,
  listFirestoreCatalogVariants,
  refreshFirestoreHasVariations,
  syncFirestoreVariantStorageHomes,
  updateFirestoreCatalogVariant,
} from "@/lib/firestore-catalog-store";
import { refreshOutletOrderCatalogForItem } from "@/lib/firestore-outlet-catalog-access";

function scheduleOutletOrderCatalogRefresh(itemId: string) {
  void refreshOutletOrderCatalogForItem(itemId).catch((error) => {
    console.error("Failed to refresh outlet order catalog", error);
  });
}

const ITEM_KINDS = ["finished", "ingredient", "raw"] as const;
type ItemKind = (typeof ITEM_KINDS)[number];

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function cleanUuid(value: unknown): string | null {
  return isUuid(value) ? value.trim() : null;
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallback;
}

function toNumber(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanItemKind(value: unknown, fallback: ItemKind): ItemKind {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "product") return "finished";
  if (ITEM_KINDS.includes(trimmed as ItemKind)) return trimmed as ItemKind;
  return fallback;
}

function normalizeStorageHomeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanUuid).filter((id): id is string => Boolean(id));
}

function normalizeVariantKey(value?: string | null) {
  const normalized = value?.trim();
  return normalized && normalized.length ? normalized : "base";
}

export async function firestoreCatalogVariantsGet(request: Request) {
  const url = new URL(request.url);
  const itemId = url.searchParams.get("item_id")?.trim() || undefined;
  const id = url.searchParams.get("id")?.trim() || undefined;
  const search = url.searchParams.get("q")?.trim().toLowerCase() || "";

  if (itemId) {
    const item = await getFirestoreCatalogItem(itemId);
    if (!item || item.active === false) return NextResponse.json({ variants: [], backend: "firebase" });
  }

  if (!itemId && !id) {
    const variants = await listFirestoreCatalogVariants({ search, activeOnly: true });
    return NextResponse.json({ variants, backend: "firebase" });
  }

  const variants = await listFirestoreCatalogVariants({ itemId, id, search });

  if (id) {
    const enriched = await enrichFirestoreVariants(variants);
    const found = enriched.find((variant) => variant.id === id);
    if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ variant: found, backend: "firebase" });
  }

  return NextResponse.json({ variants, backend: "firebase" });
}

export async function firestoreCatalogVariantsPost(request: Request) {
  const body = await request.json().catch(() => ({}));
  const itemId = cleanUuid(body.item_id);
  if (!itemId) return NextResponse.json({ error: "Parent product (item_id) is required" }, { status: 400 });

  const name = cleanText(body.name);
  if (!name) return NextResponse.json({ error: "Variant name is required" }, { status: 400 });

  const itemRow = await getFirestoreCatalogItem(itemId);
  if (!itemRow) return NextResponse.json({ error: "Parent product not found" }, { status: 404 });

  const consumptionUom = cleanText(body.consumption_uom) ?? "each";
  const purchasePackUnit = cleanText(body.purchase_pack_unit) ?? "each";
  const transferUnit = cleanText(body.transfer_unit) ?? "each";
  const unitsPerPack = toNumber(body.units_per_purchase_pack, 1);
  const transferQuantity = toNumber(body.transfer_quantity, 1);
  const cost = toNumber(body.cost ?? 0, 0);
  const sellingPrice = toNumber(body.selling_price ?? 0, 0);
  const ordersAppCostPrice = toNumber(body.orders_app_cost_price ?? sellingPrice ?? 0, 0);
  if (unitsPerPack === null || transferQuantity === null || cost === null || sellingPrice === null || ordersAppCostPrice === null) {
    return NextResponse.json({ error: "Value must be numeric" }, { status: 400 });
  }

  const requestedStorageHomeId = cleanUuid(body.storage_home_id) ?? cleanUuid(body.default_warehouse_id);
  const requestedStorageHomeIds = normalizeStorageHomeIds(body.storage_home_ids);
  const defaultWarehouseId = requestedStorageHomeId ?? requestedStorageHomeIds[0] ?? null;
  const resolvedStorageHomeIds = buildStorageHomeIds(defaultWarehouseId, requestedStorageHomeIds);

  const resolvedItemKind = cleanItemKind(body.item_kind, (itemRow.item_kind as ItemKind) ?? "finished");
  let resolvedVariantSku = cleanText(body.sku) ?? null;
  if (resolvedItemKind === "finished") {
    try {
      resolvedVariantSku = await allocateFirestorePosVariantSku(resolvedVariantSku, itemId);
    } catch (allocationError) {
      const message = allocationError instanceof Error ? allocationError.message : "Unable to allocate variant SKU";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else if (!resolvedVariantSku) {
    return NextResponse.json({ error: "Variant SKU is required" }, { status: 400 });
  }

  const providedId = cleanText(body.id) ?? cleanText(body.key);
  const variantId = providedId ?? randomUUID();
  if (normalizeVariantKey(variantId) === "base") {
    return NextResponse.json({ error: "Variant key cannot be base" }, { status: 400 });
  }

  const payload = {
    item_id: itemId,
    name,
    sku: resolvedVariantSku,
    supplier_sku: cleanText(body.supplier_sku) ?? null,
    item_kind: resolvedItemKind,
    consumption_uom: consumptionUom,
    purchase_pack_unit: purchasePackUnit,
    units_per_purchase_pack: unitsPerPack,
    transfer_unit: transferUnit,
    transfer_quantity: transferQuantity,
    cost,
    selling_price: sellingPrice,
    orders_app_uom: cleanText(body.orders_app_uom) ?? consumptionUom,
    supervisor_uom: cleanText(body.supervisor_uom) ?? cleanText(body.orders_app_uom) ?? consumptionUom,
    orders_app_cost_price: ordersAppCostPrice,
    outlet_order_visible: true,
    image_url: cleanText(body.image_url) ?? null,
    default_warehouse_id: defaultWarehouseId,
    active: cleanBoolean(body.active, true),
  };

  const data = await createFirestoreCatalogVariant(variantId, payload);
  await refreshFirestoreHasVariations(itemId);
  await syncFirestoreVariantStorageHomes(itemId, variantId, resolvedStorageHomeIds);

  const actor = parseCatalogChangeActor(request);
  await recordCatalogChange({
    operation: "insert",
    entityType: "variant",
    entityId: variantId,
    entityName: name,
    sku: resolvedVariantSku,
    itemId,
    actor,
    after: {
      name,
      selling_price: sellingPrice,
      cost,
      sku: resolvedVariantSku,
      active: payload.active,
    },
    trackedFields: [...VARIANT_TRACKED_FIELDS],
  });

  const [enriched] = await enrichFirestoreVariants([data]);
  scheduleOutletOrderCatalogRefresh(itemId);
  return NextResponse.json({ variant: enriched, backend: "firebase" });
}

export async function firestoreCatalogVariantsPut(request: Request) {
  const body = await request.json().catch(() => ({}));
  const id = cleanText(body.id);
  if (!id) return NextResponse.json({ error: "id is required for update" }, { status: 400 });

  const existing = await getFirestoreCatalogVariant(id);
  if (!existing) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

  const effectiveItemId = cleanUuid(body.item_id) ?? String(existing.item_id ?? "");
  if (!effectiveItemId) return NextResponse.json({ error: "Parent product (item_id) is required" }, { status: 400 });
  if (body.item_id && effectiveItemId !== existing.item_id) {
    return NextResponse.json({ error: "item_id does not match existing variant" }, { status: 400 });
  }

  const itemRow = await getFirestoreCatalogItem(effectiveItemId);
  if (!itemRow) return NextResponse.json({ error: "Parent product not found" }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = cleanText(body.name);
    if (!name) return NextResponse.json({ error: "Variant name is required" }, { status: 400 });
    update.name = name;
  }
  if (body.sku !== undefined) {
    const nextSku = cleanText(body.sku);
    const existingSku = String(existing.sku ?? "").trim();
    const resolvedItemKind = cleanItemKind(
      update.item_kind ?? existing.item_kind,
      (itemRow.item_kind as ItemKind) ?? "finished",
    );
    if (nextSku && existingSku && nextSku.toLowerCase() === existingSku.toLowerCase()) {
      update.sku = nextSku;
    } else if (resolvedItemKind === "finished") {
      if (!nextSku) return NextResponse.json({ error: "Variant SKU is required" }, { status: 400 });
      try {
        update.sku = await allocateFirestorePosVariantSku(nextSku, effectiveItemId, id);
      } catch (allocationError) {
        const message = allocationError instanceof Error ? allocationError.message : "Unable to allocate variant SKU";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    } else {
      update.sku = nextSku ?? null;
    }
  }
  if (body.cost !== undefined) {
    const cost = toNumber(body.cost, 0);
    if (cost === null) return NextResponse.json({ error: "Value must be numeric" }, { status: 400 });
    update.cost = cost;
  }
  if (body.selling_price !== undefined) {
    const sellingPrice = toNumber(body.selling_price, 0);
    if (sellingPrice === null) return NextResponse.json({ error: "Value must be numeric" }, { status: 400 });
    update.selling_price = sellingPrice;
  }
  if (body.orders_app_uom !== undefined) {
    update.orders_app_uom = cleanText(body.orders_app_uom) ?? "each";
  }
  if (body.supervisor_uom !== undefined) {
    update.supervisor_uom = cleanText(body.supervisor_uom) ?? cleanText(body.orders_app_uom) ?? "each";
  }
  if (body.orders_app_cost_price !== undefined) {
    const ordersAppCostPrice = toNumber(body.orders_app_cost_price, 0);
    if (ordersAppCostPrice === null) return NextResponse.json({ error: "Value must be numeric" }, { status: 400 });
    update.orders_app_cost_price = ordersAppCostPrice;
  }
  if (body.active !== undefined) update.active = cleanBoolean(body.active, true);
  if (body.image_url !== undefined) update.image_url = cleanText(body.image_url) ?? null;

  const data = await updateFirestoreCatalogVariant(id, update);
  if (!data) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

  const hasStorageHomeInput =
    body.storage_home_id !== undefined || body.default_warehouse_id !== undefined || body.storage_home_ids !== undefined;
  if (hasStorageHomeInput) {
    const storageHomeIdInput =
      body.storage_home_id !== undefined
        ? cleanUuid(body.storage_home_id)
        : body.default_warehouse_id !== undefined
          ? cleanUuid(body.default_warehouse_id)
          : null;
    const storageHomeIdsInput =
      body.storage_home_ids !== undefined ? normalizeStorageHomeIds(body.storage_home_ids) : [];
    const resolvedStorageHomeIds = buildStorageHomeIds(storageHomeIdInput, storageHomeIdsInput);
    await syncFirestoreVariantStorageHomes(effectiveItemId, id, resolvedStorageHomeIds);
  }

  const actor = parseCatalogChangeActor(request);
  await recordCatalogChange({
    operation: "update",
    entityType: "variant",
    entityId: id,
    entityName: String(update.name ?? existing.name ?? ""),
    sku: (update.sku as string | null | undefined) ?? (existing.sku as string | null) ?? null,
    itemId: effectiveItemId,
    before: existing,
    after: { ...existing, ...update },
    trackedFields: [...VARIANT_TRACKED_FIELDS],
    actor,
  });

  const [enriched] = await enrichFirestoreVariants([data]);
  scheduleOutletOrderCatalogRefresh(effectiveItemId);
  return NextResponse.json({ variant: enriched, backend: "firebase" });
}

export async function firestoreCatalogVariantsDelete(request: Request) {
  const url = new URL(request.url);
  let id = url.searchParams.get("id")?.trim() || "";
  if (!id) {
    const body = await request.json().catch(() => ({}));
    id = typeof body.id === "string" ? body.id.trim() : "";
  }
  if (!id) return NextResponse.json({ error: "Valid id is required for delete" }, { status: 400 });

  const existing = await getFirestoreCatalogVariant(id);
  if (!existing) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

  const deleted = await deleteFirestoreCatalogVariant(id);
  if (!deleted) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

  const actor = parseCatalogChangeActor(request);
  await recordCatalogChange({
    operation: "delete",
    entityType: "variant",
    entityId: id,
    entityName: existing.name as string,
    sku: (existing.sku as string | null) ?? null,
    itemId: String(existing.item_id ?? ""),
    before: existing,
    trackedFields: [...VARIANT_TRACKED_FIELDS],
    actor,
  });

  scheduleOutletOrderCatalogRefresh(String(existing.item_id ?? ""));
  return NextResponse.json({ id, backend: "firebase" });
}
