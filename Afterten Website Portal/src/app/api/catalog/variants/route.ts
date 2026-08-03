import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { allocatePosVariantSku } from "@/lib/pos-catalog-ids";
import { isMissingRelationError } from "@/lib/supabase-errors";
import { useFirebaseBackend } from "@/lib/cloud-backend";
import {
  firestoreCatalogVariantsDelete,
  firestoreCatalogVariantsGet,
  firestoreCatalogVariantsPost,
  firestoreCatalogVariantsPut,
} from "@/lib/firestore-catalog-variants";
import {
  VARIANT_TRACKED_FIELDS,
  parseCatalogChangeActor,
  recordCatalogChangeEvent,
} from "@/lib/catalog-change-events";

// Rebuilt to clear parser cache.

const QTY_UNITS = ["each", "g", "kg", "mg", "ml", "l"] as const;
const ITEM_KINDS = ["finished", "ingredient", "raw"] as const;
type QtyUnit = (typeof QTY_UNITS)[number];
type ItemKind = (typeof ITEM_KINDS)[number];

type VariantPayload = {
  item_id: string;
  name: string;
  sku?: string | null;
  supplier_sku?: string | null;
  item_kind: ItemKind;
  consumption_uom: string;
  purchase_pack_unit: string;
  units_per_purchase_pack: number;
  purchase_unit_mass?: number | null;
  purchase_unit_mass_uom?: QtyUnit | null;
  inner_pack_unit_mass?: number | null;
  inner_pack_unit_mass_uom?: QtyUnit | null;
  transfer_unit: string;
  transfer_quantity: number;
  qty_decimal_places?: number | null;
  cost: number;
  selling_price?: number | null;
  locked_from_warehouse_id?: string | null;
  outlet_order_visible: boolean;
  image_url?: string | null;
  default_warehouse_id?: string | null;
  active: boolean;
};

type RecipeRow = {
  finished_item_id: string | null;
  finished_variant_key: string | null;
};

type SupabaseError = { code?: string; message?: string; details?: string; hint?: string } | null;

type CleanResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim())
  );
}

function pickQtyUnit(value: unknown, fallback: QtyUnit): QtyUnit {
  if (typeof value === "string") {
    const trimmed = value.trim() as QtyUnit;
    if (QTY_UNITS.includes(trimmed)) return trimmed;
  }
  return fallback;
}

function toNumber(value: unknown, fallback: number, min?: number): CleanResult<number> {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    value = fallback;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(parsed)) {
    if (typeof min === "number" && parsed <= min) {
      return { ok: false, error: `Value must be greater than ${min}` };
    }
    return { ok: true, value: parsed };
  }
  return { ok: false, error: "Value must be numeric" };
}

function cleanText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  return undefined;
}

function cleanItemKind(value: unknown, fallback: ItemKind): ItemKind {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "product") return "finished";
    if (ITEM_KINDS.includes(trimmed as ItemKind)) return trimmed as ItemKind;
  }
  return fallback;
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

function cleanUuid(value: unknown): string | null {
  if (isUuid(value)) return value.trim();
  return null;
}

function normalizeStorageHomeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanUuid).filter((id): id is string => Boolean(id));
}

function buildStorageHomeIds(primaryId: string | null, extraIds: string[]): string[] {
  if (!extraIds.length && primaryId) return [primaryId];
  if (!primaryId) return extraIds;
  return extraIds.includes(primaryId) ? extraIds : [primaryId, ...extraIds];
}

type CatalogVariantRow = VariantPayload & {
  id: string;
  item_id: string;
};

const normalizeVariantKey = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized && normalized.length ? normalized : "base";
};

const VARIANT_CORE_FIELDS =
  "id,item_id,name,item_kind,consumption_uom,purchase_pack_unit,units_per_purchase_pack,cost,active";

const VARIANT_OPTIONAL_FIELDS = [
  "sku",
  "supplier_sku",
  "transfer_unit",
  "transfer_quantity",
  "purchase_unit_mass",
  "purchase_unit_mass_uom",
  "inner_pack_unit_mass",
  "inner_pack_unit_mass_uom",
  "qty_decimal_places",
  "selling_price",
  "outlet_order_visible",
  "image_url",
  "locked_from_warehouse_id",
  "default_warehouse_id",
] as const;

function missingColumnFromError(error: SupabaseError): string | null {
  if (!error) return null;
  const blob = `${error.message ?? ""} ${error.details ?? ""}`;
  const pgrst = blob.match(/Could not find the '([^']+)' column/i);
  if (pgrst?.[1]) return pgrst[1];
  const quoted =
    blob.match(/column "([^"]+)" of relation/i) ?? blob.match(/column "([^"]+)" does not exist/i);
  if (quoted?.[1]) return quoted[1];
  const bare = blob.match(/column catalog_variants\.(\w+) does not exist/i);
  return bare?.[1] ?? null;
}

function isMissingColumnError(error: SupabaseError): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /could not find the '[^']+' column/i.test(error.message ?? "");
}

function stripMissingOptionalField<T extends Record<string, unknown>>(
  payload: T,
  error: SupabaseError,
  optionalKeys: string[]
): { payload: Partial<T>; optionalKeys: string[] } | null {
  const missing = missingColumnFromError(error);
  if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
    const { [missing]: removed, ...rest } = payload;
    void removed;
    return {
      payload: rest as Partial<T>,
      optionalKeys: optionalKeys.filter((key) => key !== missing),
    };
  }
  if (!optionalKeys.length) return null;
  const [removeKey, ...restKeys] = optionalKeys;
  if (!Object.prototype.hasOwnProperty.call(payload, removeKey)) {
    return { payload, optionalKeys: restKeys };
  }
  const { [removeKey]: removed, ...rest } = payload;
  void removed;
  return { payload: rest as Partial<T>, optionalKeys: restKeys };
}

function selectVariantFields(optional: readonly string[], minimalCore = false) {
  if (minimalCore) return "id,item_id,name,sku,item_kind,active";
  const optionalPart = optional.length ? `,${optional.join(",")}` : "";
  return `${VARIANT_CORE_FIELDS}${optionalPart}`;
}

async function fetchVariantRowById(
  supabase: ReturnType<typeof getServiceClient>,
  id: string,
): Promise<{ data: Partial<CatalogVariantRow> | null; error: SupabaseError }> {
  const optional = [...VARIANT_OPTIONAL_FIELDS];
  let useMinimalCore = false;

  while (true) {
    const result = await supabase
      .from("catalog_variants")
      .select(selectVariantFields(optional, useMinimalCore))
      .eq("id", id)
      .maybeSingle();

    const error = result.error;
    if (error && isMissingColumnError(error)) {
      const missing = missingColumnFromError(error);
      if (missing) {
        const idx = optional.indexOf(missing as (typeof VARIANT_OPTIONAL_FIELDS)[number]);
        if (idx >= 0) {
          optional.splice(idx, 1);
          continue;
        }
      }
      if (optional.length) {
        optional.pop();
        continue;
      }
      if (!useMinimalCore) {
        useMinimalCore = true;
        continue;
      }
    }

    return { data: result.data as Partial<CatalogVariantRow> | null, error };
  }
}

function normalizeVariantRow(row: Partial<CatalogVariantRow>) {
  return {
    id: row.id ?? "",
    item_id: row.item_id ?? "",
    name: row.name ?? "Variant",
    sku: row.sku ?? null,
    supplier_sku: row.supplier_sku ?? null,
    item_kind: row.item_kind ?? "finished",
    consumption_uom: row.consumption_uom ?? "each",
    purchase_pack_unit: row.purchase_pack_unit ?? "each",
    units_per_purchase_pack: row.units_per_purchase_pack ?? 1,
    purchase_unit_mass: row.purchase_unit_mass ?? null,
    purchase_unit_mass_uom: row.purchase_unit_mass_uom ?? null,
    inner_pack_unit_mass: row.inner_pack_unit_mass ?? null,
    inner_pack_unit_mass_uom: row.inner_pack_unit_mass_uom ?? null,
    transfer_unit: row.transfer_unit ?? row.purchase_pack_unit ?? "each",
    transfer_quantity: row.transfer_quantity ?? 1,
    qty_decimal_places: row.qty_decimal_places ?? null,
    cost: row.cost ?? 0,
    selling_price: row.selling_price ?? null,
    locked_from_warehouse_id: row.locked_from_warehouse_id ?? null,
    outlet_order_visible: row.outlet_order_visible ?? true,
    image_url: row.image_url ?? null,
    default_warehouse_id: row.default_warehouse_id ?? null,
    active: row.active ?? true,
  };
}

function toErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return { message: "Unknown error" };
  }
  const anyError = error as { message?: string; code?: string; details?: string; hint?: string };
  return {
    message: anyError.message ?? "Unknown error",
    code: anyError.code,
    details: anyError.details,
    hint: anyError.hint,
  };
}

async function refreshHasVariations(supabase: ReturnType<typeof getServiceClient>, itemId: string) {
  const { count, error } = await supabase
    .from("catalog_variants")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId)
    .eq("active", true);
  if (error) throw error;
  const hasVariations = (count ?? 0) > 0;
  await supabase.from("catalog_items").update({ has_variations: hasVariations }).eq("id", itemId);
}

async function syncVariantStorageHomes(
  supabase: ReturnType<typeof getServiceClient>,
  itemId: string,
  variantKey: string,
  warehouseIds: string[]
) {
  const normalizedVariantKey = normalizeVariantKey(variantKey);
  const uniqueIds = Array.from(new Set(warehouseIds.filter(Boolean)));
  if (!uniqueIds.length) {
    const { error } = await supabase
      .from("item_storage_homes")
      .delete()
      .eq("item_id", itemId)
      .eq("normalized_variant_key", normalizedVariantKey);
    if (error) {
      throw new Error(error.message || "Failed to clear storage homes");
    }
    return;
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("item_storage_homes")
    .select("storage_warehouse_id")
    .eq("item_id", itemId)
    .eq("normalized_variant_key", normalizedVariantKey);
  if (existingError) {
    throw new Error(existingError.message || "Failed to load storage homes");
  }

  const existingIds = new Set(
    (Array.isArray(existingRows) ? existingRows : [])
      .map((row) => row?.storage_warehouse_id)
      .filter((id): id is string => Boolean(id))
  );
  const toDelete = Array.from(existingIds).filter((id) => !uniqueIds.includes(id));
  if (toDelete.length) {
    const { error } = await supabase
      .from("item_storage_homes")
      .delete()
      .eq("item_id", itemId)
      .eq("normalized_variant_key", normalizedVariantKey)
      .in("storage_warehouse_id", toDelete);
    if (error) {
      throw new Error(error.message || "Failed to remove storage homes");
    }
  }

  const toInsert = uniqueIds.filter((id) => !existingIds.has(id));
  if (toInsert.length) {
    const { error } = await supabase
      .from("item_storage_homes")
      .upsert(
        toInsert.map((warehouseId) => ({
          item_id: itemId,
          variant_key: variantKey,
          storage_warehouse_id: warehouseId,
        })),
        { onConflict: "item_id,normalized_variant_key,storage_warehouse_id" }
      );
    if (error) {
      throw new Error(error.message || "Failed to save storage homes");
    }
  }
}

function toVariantResponse(variantId: string, payload: VariantPayload) {
  const key = variantId.toString().trim();
  if (!key) return null;
  return {
    id: key,
    item_id: payload.item_id,
    name: payload.name ?? "Variant",
    sku: payload.sku ?? null,
    supplier_sku: payload.supplier_sku ?? null,
    item_kind: payload.item_kind ?? "finished",
    consumption_uom: payload.consumption_uom ?? "each",
    purchase_pack_unit: payload.purchase_pack_unit ?? "each",
    units_per_purchase_pack: payload.units_per_purchase_pack ?? 1,
    purchase_unit_mass: payload.purchase_unit_mass ?? null,
    purchase_unit_mass_uom: payload.purchase_unit_mass_uom ?? null,
    inner_pack_unit_mass: payload.inner_pack_unit_mass ?? null,
    inner_pack_unit_mass_uom: payload.inner_pack_unit_mass_uom ?? null,
    transfer_unit: payload.transfer_unit ?? payload.purchase_pack_unit ?? "each",
    transfer_quantity: payload.transfer_quantity ?? 1,
    qty_decimal_places: payload.qty_decimal_places ?? null,
    cost: payload.cost ?? 0,
    selling_price: payload.selling_price ?? null,
    locked_from_warehouse_id: payload.locked_from_warehouse_id ?? null,
    outlet_order_visible: payload.outlet_order_visible ?? true,
    image_url: payload.image_url ?? null,
    default_warehouse_id: payload.default_warehouse_id ?? null,
    active: payload.active ?? true,
  };
}

export async function GET(request: Request) {
  try {
    if (useFirebaseBackend()) return firestoreCatalogVariantsGet(request);
    const url = new URL(request.url);
    const itemId = url.searchParams.get("item_id")?.trim() || undefined;
    const id = url.searchParams.get("id")?.trim() || undefined;
    const search = url.searchParams.get("q")?.trim().toLowerCase() || "";
    const supabase = getServiceClient();
    let itemIds: string[] = [];

    if (itemId) {
      let itemRow: { id?: string; active?: boolean | null } | null = null;
      let itemError: SupabaseError = null;
      const primary = await supabase.from("catalog_items").select("id,active").eq("id", itemId).maybeSingle();
      itemRow = (primary.data as typeof itemRow) ?? null;
      itemError = primary.error;
      if (itemError && isMissingColumnError(itemError)) {
        const fallback = await supabase.from("catalog_items").select("id").eq("id", itemId).maybeSingle();
        itemRow = (fallback.data as typeof itemRow) ?? null;
        itemError = fallback.error;
      }
      if (itemError) throw itemError;
      const itemActive = (itemRow as { active?: boolean | null } | null)?.active;
      if (!itemRow || itemActive === false) {
        return NextResponse.json({ variants: [] });
      }
      itemIds = [itemId];
    }

    if (!itemId && !id) {
      return NextResponse.json({ variants: await loadAllVariants(supabase, search) });
    }

    const optional = [...VARIANT_OPTIONAL_FIELDS];
    let variantRows: Partial<CatalogVariantRow>[] | null = null;
    let variantError: SupabaseError = null;
    let useMinimalCore = false;

    while (true) {
      let variantQuery = supabase.from("catalog_variants").select(selectVariantFields(optional, useMinimalCore));
      if (itemIds.length) variantQuery = variantQuery.in("item_id", itemIds);
      if (id) variantQuery = variantQuery.eq("id", id);

      const result = (await variantQuery) as {
        data: Partial<CatalogVariantRow>[] | null;
        error: SupabaseError;
      };
      variantRows = result.data;
      variantError = result.error;

      if (variantError && isMissingColumnError(variantError) && optional.length) {
        optional.pop();
        continue;
      }
      if (variantError && isMissingColumnError(variantError) && !useMinimalCore) {
        useMinimalCore = true;
        continue;
      }
      break;
    }

    if (variantError) {
      if (isMissingRelationError(variantError, "catalog_variants")) {
        return NextResponse.json({ variants: [] });
      }
      throw variantError;
    }

    const enriched = await enrichVariants(supabase, variantRows ?? [], itemIds, search);

    if (id) {
      const found = enriched.find((variant) => variant.id === id);
      if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ variant: found });
    }

    return NextResponse.json({ variants: enriched });
  } catch (error) {
    const details = toErrorDetails(error);
    console.error("[catalog/variants] GET failed", details);
    return NextResponse.json({ error: "Unable to load variants", details }, { status: 500 });
  }
}

async function loadAllVariants(
  supabase: ReturnType<typeof getServiceClient>,
  search: string,
): Promise<ReturnType<typeof normalizeVariantRow>[]> {
  const optional = [...VARIANT_OPTIONAL_FIELDS];
  let variantRows: Partial<CatalogVariantRow>[] | null = null;
  let variantError: SupabaseError = null;
  let useMinimalCore = false;
  let useActiveFilter = true;

  while (true) {
    let variantQuery = supabase.from("catalog_variants").select(selectVariantFields(optional, useMinimalCore));
    if (useActiveFilter) {
      variantQuery = variantQuery.eq("active", true);
    }

    const result = (await variantQuery) as {
      data: Partial<CatalogVariantRow>[] | null;
      error: SupabaseError;
    };
    variantRows = result.data;
    variantError = result.error;

    if (variantError && isMissingColumnError(variantError) && optional.length) {
      optional.pop();
      continue;
    }
    if (variantError && isMissingColumnError(variantError) && useActiveFilter) {
      useActiveFilter = false;
      continue;
    }
    if (variantError && isMissingColumnError(variantError) && !useMinimalCore) {
      useMinimalCore = true;
      continue;
    }
    break;
  }

  if (variantError) {
    if (isMissingRelationError(variantError, "catalog_variants")) {
      return [];
    }
    throw variantError;
  }

  const itemIds = Array.from(
    new Set(
      (variantRows ?? [])
        .map((row) => row.item_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  return enrichVariants(supabase, variantRows ?? [], itemIds, search);
}

async function enrichVariants(
  supabase: ReturnType<typeof getServiceClient>,
  variantRows: Partial<CatalogVariantRow>[],
  itemIds: string[],
  search: string,
) {
  const normalizeVariant = (key: string | null | undefined) => (key && key.trim() ? key.trim() : "base");

  const variants = (variantRows ?? [])
    .map((row) => normalizeVariantRow(row))
    .filter((variant) => normalizeVariantKey(variant.id) !== "base")
    .map((variant) => ({
      ...variant,
      has_recipe: false,
    }));

  const storageItemIds =
    itemIds.length > 0
      ? itemIds
      : Array.from(new Set(variants.map((variant) => variant.item_id).filter(Boolean)));

  const storageHomeIdsByKey: Record<string, string[]> = {};
  if (storageItemIds.length) {
    let storageRows: {
      item_id?: string;
      normalized_variant_key?: string | null;
      variant_key?: string | null;
      storage_warehouse_id?: string | null;
    }[] = [];
    let storageErr: SupabaseError = null;

    const primary = await supabase
      .from("item_storage_homes")
      .select("item_id, normalized_variant_key, storage_warehouse_id")
      .in("item_id", storageItemIds);
    storageRows = (primary.data as typeof storageRows) ?? [];
    storageErr = primary.error;

    if (storageErr && isMissingColumnError(storageErr)) {
      const fallback = await supabase
        .from("item_storage_homes")
        .select("item_id, variant_key, storage_warehouse_id")
        .in("item_id", storageItemIds);
      storageRows = (fallback.data as typeof storageRows) ?? [];
      storageErr = fallback.error;
    }

    if (storageErr && !isMissingRelationError(storageErr, "item_storage_homes")) {
      throw storageErr;
    }

    storageRows.forEach((row) => {
      const rawKey = row?.normalized_variant_key ?? row?.variant_key ?? null;
      const normalizedKey = normalizeVariantKey(rawKey ?? undefined);
      if (!row?.item_id || !normalizedKey || !row.storage_warehouse_id) return;
      const key = `${row.item_id}::${normalizedKey}`;
      const list = storageHomeIdsByKey[key] ?? [];
      if (!list.includes(row.storage_warehouse_id)) {
        list.push(row.storage_warehouse_id);
      }
      storageHomeIdsByKey[key] = list;
    });
  }

  const variantsWithStorage = variants.map((variant) => {
    const normalizedKey = normalizeVariant(variant.id);
    const storageKey = `${variant.item_id}::${normalizedKey}`;
    const storageHomeIds = storageHomeIdsByKey[storageKey] ?? [];
    const defaultWarehouseId = variant.default_warehouse_id ?? null;
    const resolvedStorageHomeIds = buildStorageHomeIds(defaultWarehouseId, storageHomeIds);
    const storageHomeId = resolvedStorageHomeIds[0] ?? null;
    return { ...variant, storage_home_id: storageHomeId, storage_home_ids: resolvedStorageHomeIds };
  });

  if (!search) return variantsWithStorage;

  return variantsWithStorage.filter((variant) => {
    const name = variant.name?.toLowerCase?.() ?? "";
    const sku = variant.sku?.toLowerCase?.() ?? "";
    const supplierSku = variant.supplier_sku?.toLowerCase?.() ?? "";
    return name.includes(search) || sku.includes(search) || supplierSku.includes(search);
  });
}

export async function POST(request: Request) {
  try {
    if (useFirebaseBackend()) return firestoreCatalogVariantsPost(request);
    const body = await request.json().catch(() => ({}));
    const itemId = cleanUuid(body.item_id);
    if (!itemId) return NextResponse.json({ error: "Parent product (item_id) is required" }, { status: 400 });

    const name = cleanText(body.name);
    if (!name) return NextResponse.json({ error: "Variant name is required" }, { status: 400 });

    const consumptionUom = cleanText(body.consumption_uom) ?? "each";
    const purchasePackUnit = cleanText(body.purchase_pack_unit) ?? "each";
    const transferUnit = cleanText(body.transfer_unit) ?? "each";

    const unitsPerPack = toNumber(body.units_per_purchase_pack, 1, 0);
    if (!unitsPerPack.ok) return NextResponse.json({ error: unitsPerPack.error }, { status: 400 });

    const transferQuantity = toNumber(body.transfer_quantity, 1, 0);
    if (!transferQuantity.ok) return NextResponse.json({ error: transferQuantity.error }, { status: 400 });

    const cost = toNumber(body.cost ?? 0, 0, -1);
    if (!cost.ok) return NextResponse.json({ error: cost.error }, { status: 400 });

    const sellingPrice = toNumber(body.selling_price ?? 0, 0, -0.0001);
    if (!sellingPrice.ok) return NextResponse.json({ error: sellingPrice.error }, { status: 400 });

    let purchaseUnitMass: number | null = null;
    if (body.purchase_unit_mass !== undefined && body.purchase_unit_mass !== null && `${body.purchase_unit_mass}`.trim() !== "") {
      const mass = toNumber(body.purchase_unit_mass, 0, 0);
      if (!mass.ok) return NextResponse.json({ error: mass.error }, { status: 400 });
      purchaseUnitMass = mass.value;
    }
    let innerPackUnitMass: number | null = null;
    if (body.inner_pack_unit_mass !== undefined && body.inner_pack_unit_mass !== null && `${body.inner_pack_unit_mass}`.trim() !== "") {
      const mass = toNumber(body.inner_pack_unit_mass, 0, 0);
      if (!mass.ok) return NextResponse.json({ error: mass.error }, { status: 400 });
      innerPackUnitMass = mass.value;
    }
    let qtyDecimalPlaces: number | null = null;
    if (body.qty_decimal_places !== undefined && body.qty_decimal_places !== null && `${body.qty_decimal_places}`.trim() !== "") {
      const places = toNumber(body.qty_decimal_places, 0, -1);
      if (!places.ok) return NextResponse.json({ error: places.error }, { status: 400 });
      qtyDecimalPlaces = Math.max(0, Math.min(6, Math.round(places.value)));
    }

    const supabase = getServiceClient();
    const { data: itemRow, error: itemError } = (await supabase
      .from("catalog_items")
      .select("id,item_kind,sku")
      .eq("id", itemId)
      .maybeSingle()) as { data: { id: string; item_kind?: ItemKind | null; sku?: string | null } | null; error: Error | null };
    if (itemError) throw itemError;
    if (!itemRow) return NextResponse.json({ error: "Parent product not found" }, { status: 404 });

    const requestedStorageHomeId = cleanUuid(body.storage_home_id) ?? cleanUuid(body.default_warehouse_id);
    const requestedStorageHomeIds = normalizeStorageHomeIds(body.storage_home_ids);
    const defaultWarehouseId = requestedStorageHomeId ?? requestedStorageHomeIds[0] ?? null;
    const resolvedStorageHomeIds = buildStorageHomeIds(defaultWarehouseId, requestedStorageHomeIds);

    let resolvedVariantSku = cleanText(body.sku) ?? null;
    const resolvedItemKind = cleanItemKind(body.item_kind, itemRow?.item_kind ?? "finished");
    if (resolvedItemKind === "finished") {
      try {
        resolvedVariantSku = await allocatePosVariantSku(supabase, resolvedVariantSku, itemId);
      } catch (allocationError) {
        const message =
          allocationError instanceof Error ? allocationError.message : "Unable to allocate variant SKU";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    } else if (!resolvedVariantSku) {
      return NextResponse.json({ error: "Variant SKU is required" }, { status: 400 });
    }

    const payload: VariantPayload = {
      item_id: itemId,
      name,
      sku: resolvedVariantSku ?? null,
      supplier_sku: cleanText(body.supplier_sku) ?? null,
      item_kind: resolvedItemKind,
      consumption_uom: consumptionUom,
      purchase_pack_unit: purchasePackUnit,
      units_per_purchase_pack: unitsPerPack.value,
      purchase_unit_mass: purchaseUnitMass,
      purchase_unit_mass_uom: purchaseUnitMass ? pickQtyUnit(body.purchase_unit_mass_uom, "kg") : null,
      inner_pack_unit_mass: innerPackUnitMass,
      inner_pack_unit_mass_uom: innerPackUnitMass ? pickQtyUnit(body.inner_pack_unit_mass_uom, "kg") : null,
      transfer_unit: transferUnit,
      transfer_quantity: transferQuantity.value,
      qty_decimal_places: qtyDecimalPlaces,
      cost: cost.value,
      selling_price: sellingPrice.value,
      outlet_order_visible: true,
      image_url: cleanText(body.image_url) ?? null,
      active: cleanBoolean(body.active, true),
    };

    const providedId = cleanText(body.id) ?? cleanText(body.key);
    const variantId = providedId ?? randomUUID();
    if (normalizeVariantKey(variantId) === "base") {
      return NextResponse.json({ error: "Variant key cannot be base" }, { status: 400 });
    }

    let attemptInsert: Record<string, unknown> = { id: variantId, ...payload };
    let optionalKeys: string[] = [...VARIANT_OPTIONAL_FIELDS];
    let insertError: SupabaseError = null;
    let skuRetries = 0;

    while (true) {
      const { error } = await supabase.from("catalog_variants").insert(attemptInsert);
      insertError = error ?? null;

      if (insertError?.code === "23505" && resolvedItemKind === "finished" && skuRetries < 5) {
        const blob = `${insertError.details ?? ""} ${insertError.message ?? ""} ${insertError.hint ?? ""}`.toLowerCase();
        if (blob.includes("sku")) {
          resolvedVariantSku = await allocatePosVariantSku(supabase, null, itemId);
          payload.sku = resolvedVariantSku;
          attemptInsert = { ...attemptInsert, sku: resolvedVariantSku };
          skuRetries += 1;
          continue;
        }
      }

      if (isMissingColumnError(insertError) && optionalKeys.length) {
        const stripped = stripMissingOptionalField(attemptInsert, insertError, optionalKeys);
        if (stripped) {
          attemptInsert = stripped.payload;
          optionalKeys = stripped.optionalKeys;
          continue;
        }
      }
      break;
    }

    if (insertError) throw insertError;

    await refreshHasVariations(supabase, itemId);

    const responseVariant = toVariantResponse(variantId, payload);
    if (!responseVariant) return NextResponse.json({ error: "Failed to save variant" }, { status: 500 });

    try {
      await syncVariantStorageHomes(supabase, itemId, responseVariant.id, resolvedStorageHomeIds);
    } catch (storageError) {
      console.error("[catalog/variants] storage home upsert failed", storageError);
    }

    const actor = parseCatalogChangeActor(request);
    await recordCatalogChangeEvent(supabase, {
      operation: "insert",
      entityType: "variant",
      entityId: variantId,
      entityName: name,
      sku: resolvedVariantSku,
      itemId,
      actor,
      after: {
        name,
        selling_price: sellingPrice.value,
        cost: cost.value,
        sku: resolvedVariantSku,
        active: payload.active,
      },
      trackedFields: [...VARIANT_TRACKED_FIELDS],
    });

    return NextResponse.json({
      variant: {
        ...responseVariant,
        storage_home_id: responseVariant.default_warehouse_id ?? null,
        storage_home_ids: resolvedStorageHomeIds,
      },
    });
  } catch (error) {
    console.error("[catalog/variants] POST failed", error);
    const dbError = error as { code?: string; message?: string };
    if (dbError?.code === "23505") {
      return NextResponse.json({ error: "A variant with this SKU or name already exists" }, { status: 409 });
    }
    const message = dbError?.message || (error instanceof Error ? error.message : "Unable to create variant");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (useFirebaseBackend()) return firestoreCatalogVariantsPut(request);
    const body = await request.json().catch(() => ({}));
    const id = cleanText(body.id);
    if (!id) return NextResponse.json({ error: "id is required for update" }, { status: 400 });

    const itemId = cleanUuid(body.item_id);
    const supabase = getServiceClient();
    const { data: existing, error: existingError } = await fetchVariantRowById(supabase, id);
    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

    const effectiveItemId = itemId ?? (existing as CatalogVariantRow).item_id;
    if (!effectiveItemId) return NextResponse.json({ error: "Parent product (item_id) is required" }, { status: 400 });
    if (itemId && itemId !== (existing as CatalogVariantRow).item_id) {
      return NextResponse.json({ error: "item_id does not match existing variant" }, { status: 400 });
    }

    const { data: itemRow, error: itemError } = (await supabase
      .from("catalog_items")
      .select("id,item_kind,sku")
      .eq("id", effectiveItemId)
      .maybeSingle()) as { data: { id: string; item_kind?: ItemKind | null; sku?: string | null } | null; error: Error | null };
    if (itemError) throw itemError;
    if (!itemRow) return NextResponse.json({ error: "Parent product not found" }, { status: 404 });

    const update: Partial<VariantPayload> = {};
    const storageHomeIdsInput = body.storage_home_ids !== undefined ? normalizeStorageHomeIds(body.storage_home_ids) : null;
    const storageHomeIdInput =
      body.storage_home_id !== undefined
        ? cleanUuid(body.storage_home_id)
        : body.default_warehouse_id !== undefined
          ? cleanUuid(body.default_warehouse_id)
          : null;
    const hasStorageHomeInput =
      body.storage_home_id !== undefined || body.default_warehouse_id !== undefined || body.storage_home_ids !== undefined;

    if (body.name !== undefined) {
      const name = cleanText(body.name);
      if (!name) return NextResponse.json({ error: "Variant name is required" }, { status: 400 });
      update.name = name;
    }

    if (body.sku !== undefined) {
      const nextSku = cleanText(body.sku);
      const existingSku = (existing as CatalogVariantRow).sku?.trim() ?? "";
      const resolvedItemKind =
        update.item_kind ?? (existing as CatalogVariantRow).item_kind ?? itemRow?.item_kind ?? "finished";
      if (nextSku && existingSku && nextSku.toLowerCase() === existingSku.toLowerCase()) {
        // SKU unchanged — skip re-allocation on price/name-only edits.
      } else if (resolvedItemKind === "finished") {
        if (!nextSku) {
          return NextResponse.json({ error: "Variant SKU is required" }, { status: 400 });
        }
        try {
          update.sku = await allocatePosVariantSku(supabase, nextSku, effectiveItemId, id);
        } catch (allocationError) {
          const message =
            allocationError instanceof Error ? allocationError.message : "Unable to allocate variant SKU";
          return NextResponse.json({ error: message }, { status: 400 });
        }
      } else {
        update.sku = nextSku ?? null;
      }
    }
    if (body.supplier_sku !== undefined) update.supplier_sku = cleanText(body.supplier_sku) ?? null;
    if (body.item_kind !== undefined) {
      update.item_kind = cleanItemKind(body.item_kind, (existing as CatalogVariantRow).item_kind ?? itemRow?.item_kind ?? "finished");
    }
    if (body.consumption_uom !== undefined) {
      update.consumption_uom = cleanText(body.consumption_uom) ?? "each";
    }
    if (body.purchase_pack_unit !== undefined) {
      update.purchase_pack_unit = cleanText(body.purchase_pack_unit) ?? "each";
    }
    if (body.units_per_purchase_pack !== undefined) {
      if (body.units_per_purchase_pack === null || `${body.units_per_purchase_pack}`.trim() === "") {
        return NextResponse.json({ error: "Value must be numeric" }, { status: 400 });
      }
      const unitsPerPack = toNumber(body.units_per_purchase_pack, 1, 0);
      if (!unitsPerPack.ok) return NextResponse.json({ error: unitsPerPack.error }, { status: 400 });
      update.units_per_purchase_pack = unitsPerPack.value;
    }
    if (body.purchase_unit_mass !== undefined) {
      if (body.purchase_unit_mass === null || `${body.purchase_unit_mass}`.trim() === "") {
        update.purchase_unit_mass = null;
      } else {
        const mass = toNumber(body.purchase_unit_mass, 0, 0);
        if (!mass.ok) return NextResponse.json({ error: mass.error }, { status: 400 });
        update.purchase_unit_mass = mass.value;
      }
    }
    if (body.purchase_unit_mass_uom !== undefined) {
      const massUom = cleanText(body.purchase_unit_mass_uom);
      update.purchase_unit_mass_uom = massUom ? pickQtyUnit(massUom, "g") : null;
    }
    if (body.inner_pack_unit_mass !== undefined) {
      if (body.inner_pack_unit_mass === null || `${body.inner_pack_unit_mass}`.trim() === "") {
        update.inner_pack_unit_mass = null;
      } else {
        const mass = toNumber(body.inner_pack_unit_mass, 0, 0);
        if (!mass.ok) return NextResponse.json({ error: mass.error }, { status: 400 });
        update.inner_pack_unit_mass = mass.value;
      }
    }
    if (body.inner_pack_unit_mass_uom !== undefined) {
      const massUom = cleanText(body.inner_pack_unit_mass_uom);
      update.inner_pack_unit_mass_uom = massUom ? pickQtyUnit(massUom, "g") : null;
    }
    if (body.transfer_unit !== undefined) {
      update.transfer_unit = cleanText(body.transfer_unit) ?? "each";
    }
    if (body.transfer_quantity !== undefined) {
      if (body.transfer_quantity === null || `${body.transfer_quantity}`.trim() === "") {
        return NextResponse.json({ error: "Value must be numeric" }, { status: 400 });
      }
      const transferQuantity = toNumber(body.transfer_quantity, 1, 0);
      if (!transferQuantity.ok) return NextResponse.json({ error: transferQuantity.error }, { status: 400 });
      update.transfer_quantity = transferQuantity.value;
    }
    if (body.qty_decimal_places !== undefined) {
      if (body.qty_decimal_places === null || `${body.qty_decimal_places}`.trim() === "") {
        update.qty_decimal_places = null;
      } else {
        const places = toNumber(body.qty_decimal_places, 0, -1);
        if (!places.ok) return NextResponse.json({ error: places.error }, { status: 400 });
        update.qty_decimal_places = Math.max(0, Math.min(6, Math.round(places.value)));
      }
    }
    if (body.cost !== undefined) {
      if (body.cost === null || `${body.cost}`.trim() === "") {
        return NextResponse.json({ error: "Value must be numeric" }, { status: 400 });
      }
      const cost = toNumber(body.cost, 0, -1);
      if (!cost.ok) return NextResponse.json({ error: cost.error }, { status: 400 });
      update.cost = cost.value;
    }
    if (body.selling_price !== undefined) {
      if (body.selling_price === null || `${body.selling_price}`.trim() === "") {
        update.selling_price = null;
      } else {
        const sellingPrice = toNumber(body.selling_price, 0, -0.0001);
        if (!sellingPrice.ok) return NextResponse.json({ error: sellingPrice.error }, { status: 400 });
        update.selling_price = sellingPrice.value;
      }
    }
    if (body.image_url !== undefined) update.image_url = cleanText(body.image_url) ?? null;
    if (hasStorageHomeInput) {
      update.default_warehouse_id = storageHomeIdInput ?? storageHomeIdsInput?.[0] ?? null;
    }
    if (body.active !== undefined) update.active = cleanBoolean(body.active, true);

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No update fields provided" }, { status: 400 });
    }

    let updatePayload: Partial<VariantPayload> = { ...update };
    const optionalKeys = VARIANT_OPTIONAL_FIELDS.filter((key) => key in updatePayload);
    let updateError: SupabaseError = null;

    while (true) {
      const result = await supabase
        .from("catalog_variants")
        .update(updatePayload)
        .eq("id", id)
        .eq("item_id", effectiveItemId);
      updateError = result.error;

      if (updateError && isMissingColumnError(updateError) && optionalKeys.length) {
        const removeKey = optionalKeys.pop();
        if (removeKey) {
          const { [removeKey]: removed, ...rest } = updatePayload as Record<string, unknown>;
          void removed;
          updatePayload = rest as Partial<VariantPayload>;
          if (Object.keys(updatePayload).length === 0) {
            return NextResponse.json(
              { error: "Update fields are not supported by current schema" },
              { status: 400 }
            );
          }
          continue;
        }
      }
      break;
    }

    if (updateError) throw updateError;

    await refreshHasVariations(supabase, effectiveItemId);

    const mergedVariant = { ...(existing as CatalogVariantRow), ...update, item_id: effectiveItemId } as CatalogVariantRow;
    const responseVariant = toVariantResponse(id, mergedVariant as VariantPayload);
    if (!responseVariant) return NextResponse.json({ error: "Failed to update variant" }, { status: 500 });

    let resolvedStorageHomeIds: string[] | null = null;
    if (hasStorageHomeInput) {
      try {
        resolvedStorageHomeIds = buildStorageHomeIds(
          update.default_warehouse_id ?? null,
          storageHomeIdsInput ?? (storageHomeIdInput ? [storageHomeIdInput] : [])
        );
        await syncVariantStorageHomes(supabase, effectiveItemId, responseVariant.id, resolvedStorageHomeIds);
      } catch (storageError) {
        console.error("[catalog/variants] storage home upsert failed", storageError);
      }
    }

    const actor = parseCatalogChangeActor(request);
    await recordCatalogChangeEvent(supabase, {
      operation: "update",
      entityType: "variant",
      entityId: id,
      entityName: mergedVariant.name,
      sku: mergedVariant.sku ?? null,
      itemId: effectiveItemId,
      before: existing as Record<string, unknown>,
      after: {
        name: mergedVariant.name,
        selling_price: mergedVariant.selling_price,
        cost: mergedVariant.cost,
        sku: mergedVariant.sku ?? null,
        active: mergedVariant.active,
      },
      trackedFields: [...VARIANT_TRACKED_FIELDS],
      actor,
    });

    return NextResponse.json({
      variant: {
        ...responseVariant,
        storage_home_id: responseVariant.default_warehouse_id ?? null,
        storage_home_ids: resolvedStorageHomeIds ?? buildStorageHomeIds(responseVariant.default_warehouse_id ?? null, []),
      },
    });
  } catch (error) {
    const details = toErrorDetails(error);
    console.error("[catalog/variants] PUT failed", details);
    if (details.code === "23505") {
      return NextResponse.json(
        { error: "A variant with this SKU or name already exists", details },
        { status: 409 },
      );
    }
    const message = details.message || "Unable to update variant";
    return NextResponse.json({ error: message, details }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (useFirebaseBackend()) return firestoreCatalogVariantsDelete(request);
    const url = new URL(request.url);
    let id = url.searchParams.get("id")?.trim() || "";
    let itemId = url.searchParams.get("item_id")?.trim() || "";
    if (!id || !itemId) {
      const body = await request.json().catch(() => ({}));
      if (!id) id = typeof body.id === "string" ? body.id.trim() : "";
      if (!itemId) itemId = typeof body.item_id === "string" ? body.item_id.trim() : "";
    }

    if (!id) return NextResponse.json({ error: "Variant id is required" }, { status: 400 });
    if (!itemId || !isUuid(itemId)) return NextResponse.json({ error: "Valid parent item_id is required" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: existing, error: existingError } = await supabase
      .from("catalog_variants")
      .select("id,item_id,name,sku,cost,selling_price,active")
      .eq("id", id)
      .eq("item_id", itemId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

    const { error: deleteError } = await supabase
      .from("catalog_variants")
      .delete()
      .eq("id", id)
      .eq("item_id", itemId);
    if (deleteError) throw deleteError;

    await refreshHasVariations(supabase, itemId);

    const actor = parseCatalogChangeActor(request);
    await recordCatalogChangeEvent(supabase, {
      operation: "delete",
      entityType: "variant",
      entityId: id,
      entityName: existing.name as string,
      sku: (existing.sku as string | null) ?? null,
      itemId,
      before: existing as Record<string, unknown>,
      trackedFields: [...VARIANT_TRACKED_FIELDS],
      actor,
    });

    return NextResponse.json({ id, item_id: itemId });
  } catch (error) {
    console.error("[catalog/variants] DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete variant" }, { status: 500 });
  }
}
