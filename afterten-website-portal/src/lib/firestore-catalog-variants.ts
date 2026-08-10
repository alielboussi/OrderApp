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
  bulkUpdateFirestoreCatalogVariants,
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
import { parseCatalogUomInput, resolveBodyCatalogUoms } from "@/lib/catalog-uom-fields";
import { resolveCatalogUomWeight } from "@/lib/catalog-order-fields";
import {
  buildSupervisorUomConversionFirestoreFields,
  parseSupervisorUomConversionInput,
} from "@/lib/supervisor-uom-conversion";
import { listFirestoreUomOptions } from "@/lib/firestore-uoms";
import { getFirestoreDb } from "@/lib/firebase-server";
import { normalizeUomCode, registerCatalogUomOptions } from "@/lib/uom-codes";

const BULK_EDITABLE_FIELDS = [
  "orders_app_uom",
  "supervisor_uom",
  "cost",
  "orders_app_cost_price",
  "selling_price",
  "active",
] as const;

type BulkEditableField = (typeof BULK_EDITABLE_FIELDS)[number];

async function scheduleOutletOrderCatalogRefresh(itemId: string) {
  try {
    await refreshOutletOrderCatalogForItem(itemId);
  } catch (error) {
    console.error("Failed to refresh outlet order catalog", error);
  }
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

function isBulkEditableField(value: string): value is BulkEditableField {
  return (BULK_EDITABLE_FIELDS as readonly string[]).includes(value);
}

function buildBulkFieldUpdate(
  field: BulkEditableField,
  value: unknown,
  catalogUoms: Array<{ value: string; label: string }>,
): { ok: true; update: Record<string, unknown> } | { ok: false; error: string } {
  switch (field) {
    case "orders_app_uom": {
      const normalized = parseCatalogUomInput(value, catalogUoms, "");
      if (!normalized) return { ok: false, error: "Select a valid UOM from Catalog → UOMs" };
      return { ok: true, update: { orders_app_uom: normalized, consumption_uom: normalized } };
    }
    case "supervisor_uom": {
      const normalized = parseCatalogUomInput(value, catalogUoms, "");
      if (!normalized) return { ok: false, error: "Select a valid UOM from Catalog → UOMs" };
      return { ok: true, update: { supervisor_uom: normalized } };
    }
    case "cost":
    case "selling_price": {
      const num = toNumber(value, 0);
      if (num === null || num <= 0) {
        return { ok: false, error: "Enter a number greater than 0" };
      }
      return { ok: true, update: { [field]: num } };
    }
    case "orders_app_cost_price": {
      if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
        return { ok: true, update: { orders_app_cost_price: null } };
      }
      const num = toNumber(value, 0);
      if (num === null || num < 0) {
        return { ok: false, error: "Enter a non-negative number" };
      }
      return { ok: true, update: { orders_app_cost_price: num } };
    }
    case "active":
      return { ok: true, update: { active: cleanBoolean(value, true) } };
    default:
      return { ok: false, error: "Unsupported field" };
  }
}

async function resolveCatalogOrderUoms(body: Record<string, unknown>) {
  const catalogUoms = await listFirestoreUomOptions();
  registerCatalogUomOptions(catalogUoms);
  if (catalogUoms.length === 0) {
    return { error: "Add at least one active UOM in Catalog → UOMs before saving order units." as const };
  }
  const resolved = resolveBodyCatalogUoms(body, catalogUoms);
  const ordersAppUom = resolved.orders_app_uom;
  const supervisorUom = resolved.supervisor_uom;
  if (!ordersAppUom) {
    return { error: "Select a valid OrdersApp UOM from Catalog → UOMs." as const };
  }
  if (!supervisorUom) {
    return { error: "Select a valid Supervisor UOM from Catalog → UOMs." as const };
  }
  const consumptionUom = normalizeUomCode(resolved.consumption_uom, ordersAppUom);
  return { ordersAppUom, supervisorUom, consumptionUom };
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

  const orderUoms = await resolveCatalogOrderUoms(body);
  if ("error" in orderUoms) return NextResponse.json({ error: orderUoms.error }, { status: 400 });
  const { ordersAppUom, supervisorUom, consumptionUom } = orderUoms;
  const uomWeight = resolveCatalogUomWeight(body);
  if ("error" in uomWeight) return NextResponse.json({ error: uomWeight.error }, { status: 400 });
  const conversion = parseSupervisorUomConversionInput(
    body.orders_uom_conversion_qty ?? body.supervisor_uom_qty_per_unit ?? 1,
    body.supervisor_uom_conversion_qty ?? 1,
  );
  if ("error" in conversion) return NextResponse.json({ error: conversion.error }, { status: 400 });
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
    orders_app_uom: ordersAppUom,
    supervisor_uom: supervisorUom,
    orders_app_cost_price: ordersAppCostPrice,
    ...buildSupervisorUomConversionFirestoreFields(conversion),
    uom_weight_enabled: uomWeight.uom_weight_enabled,
    uom_weight_grams: uomWeight.uom_weight_grams,
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
  await scheduleOutletOrderCatalogRefresh(itemId);
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

  const needsCatalogUoms =
    body.orders_app_uom !== undefined ||
    body.consumption_uom !== undefined ||
    body.supervisor_uom !== undefined;
  const catalogUoms = needsCatalogUoms ? await listFirestoreUomOptions() : [];
  if (needsCatalogUoms) {
    registerCatalogUomOptions(catalogUoms);
    if (catalogUoms.length === 0) {
      return NextResponse.json(
        { error: "Add at least one active UOM in Catalog → UOMs before saving order units." },
        { status: 400 },
      );
    }
  }

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
    const ordersAppUom = parseCatalogUomInput(body.orders_app_uom, catalogUoms, "");
    if (!ordersAppUom) {
      return NextResponse.json({ error: "Select a valid OrdersApp UOM from Catalog → UOMs." }, { status: 400 });
    }
    update.orders_app_uom = ordersAppUom;
    if (body.consumption_uom === undefined) {
      update.consumption_uom = ordersAppUom;
    }
  }
  if (body.consumption_uom !== undefined) {
    const consumptionUom = parseCatalogUomInput(body.consumption_uom, catalogUoms, "");
    if (!consumptionUom) {
      return NextResponse.json({ error: "Select a valid consumption UOM from Catalog → UOMs." }, { status: 400 });
    }
    update.consumption_uom = consumptionUom;
  }
  if (body.supervisor_uom !== undefined) {
    const supervisorUom = parseCatalogUomInput(body.supervisor_uom, catalogUoms, "");
    if (!supervisorUom) {
      return NextResponse.json({ error: "Select a valid Supervisor UOM from Catalog → UOMs." }, { status: 400 });
    }
    update.supervisor_uom = supervisorUom;
  }
  if (body.orders_app_cost_price !== undefined) {
    const ordersAppCostPrice = toNumber(body.orders_app_cost_price, 0);
    if (ordersAppCostPrice === null) return NextResponse.json({ error: "Value must be numeric" }, { status: 400 });
    update.orders_app_cost_price = ordersAppCostPrice;
  }
  if (body.uom_weight_enabled !== undefined || body.uom_weight_grams !== undefined) {
    const uomWeight = resolveCatalogUomWeight({
      uom_weight_enabled:
        body.uom_weight_enabled !== undefined
          ? body.uom_weight_enabled
          : existing.uom_weight_enabled,
      uom_weight_grams:
        body.uom_weight_grams !== undefined ? body.uom_weight_grams : existing.uom_weight_grams,
    });
    if ("error" in uomWeight) {
      return NextResponse.json({ error: uomWeight.error }, { status: 400 });
    }
    update.uom_weight_enabled = uomWeight.uom_weight_enabled;
    update.uom_weight_grams = uomWeight.uom_weight_grams;
  }
  if (body.active !== undefined) update.active = cleanBoolean(body.active, true);
  if (body.image_url !== undefined) update.image_url = cleanText(body.image_url) ?? null;
  if (
    body.orders_uom_conversion_qty !== undefined ||
    body.supervisor_uom_conversion_qty !== undefined ||
    body.supervisor_uom_qty_per_unit !== undefined
  ) {
    const conversion = parseSupervisorUomConversionInput(
      body.orders_uom_conversion_qty ??
        existing.orders_uom_conversion_qty ??
        existing.supervisor_uom_qty_per_unit ??
        1,
      body.supervisor_uom_conversion_qty ?? existing.supervisor_uom_conversion_qty ?? 1,
    );
    if ("error" in conversion) {
      return NextResponse.json({ error: conversion.error }, { status: 400 });
    }
    Object.assign(update, buildSupervisorUomConversionFirestoreFields(conversion));
  }

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
  await scheduleOutletOrderCatalogRefresh(effectiveItemId);
  return NextResponse.json({ variant: enriched, backend: "firebase" });
}

export async function firestoreCatalogVariantsBulkPatch(request: Request) {
  const body = await request.json().catch(() => ({}));
  const field = cleanText(body.field);
  if (!field || !isBulkEditableField(field)) {
    return NextResponse.json({ error: "Unsupported bulk update field" }, { status: 400 });
  }

  const variantIds = Array.isArray(body.variant_ids)
    ? body.variant_ids
        .map((value: unknown) => cleanText(value))
        .filter((value: string | undefined): value is string => Boolean(value))
    : [];
  if (!variantIds.length) {
    return NextResponse.json({ error: "Select at least one variant" }, { status: 400 });
  }

  const catalogUoms = await listFirestoreUomOptions();
  registerCatalogUomOptions(catalogUoms);
  const parsed = buildBulkFieldUpdate(field, body.value, catalogUoms);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const db = getFirestoreDb();
  const refs = variantIds.map((id: string) => db.collection("catalog_variants").doc(id));
  const snapshots = await db.getAll(...refs);
  const existing = snapshots.filter((snap) => snap.exists);
  if (!existing.length) {
    return NextResponse.json({ error: "No matching variants found" }, { status: 404 });
  }

  const itemIds = new Set<string>();
  const updates = existing.map((snap) => {
    const itemId = String(snap.data()?.item_id ?? "");
    if (itemId) itemIds.add(itemId);
    return { id: snap.id, payload: parsed.update };
  });

  const updatedCount = await bulkUpdateFirestoreCatalogVariants(updates);

  const actor = parseCatalogChangeActor(request);
  const first = existing[0]!;
  await recordCatalogChange({
    operation: "update",
    entityType: "variant",
    entityId: first.id,
    entityName: `Bulk update (${updatedCount} variant${updatedCount === 1 ? "" : "s"})`,
    sku: (first.data()?.sku as string | null) ?? null,
    itemId: String(first.data()?.item_id ?? ""),
    before: { field },
    after: { field, value: parsed.update[field], variant_ids: updates.map((entry) => entry.id) },
    trackedFields: [field],
    actor,
  });

  await Promise.all([...itemIds].map((itemId) => scheduleOutletOrderCatalogRefresh(itemId)));

  return NextResponse.json({
    updated_count: updatedCount,
    variant_ids: updates.map((entry) => entry.id),
    backend: "firebase",
  });
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

  await scheduleOutletOrderCatalogRefresh(String(existing.item_id ?? ""));
  return NextResponse.json({ id, backend: "firebase" });
}
