import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { allocatePosItemSku } from "@/lib/pos-catalog-ids";
import { isMissingRelationError } from "@/lib/supabase-errors";
import {
  ITEM_TRACKED_FIELDS,
  parseCatalogChangeActor,
  recordCatalogChangeEvent,
} from "@/lib/catalog-change-events";

const ITEM_KINDS = ["finished", "ingredient", "raw"] as const;
const QTY_UNITS = ["each", "g", "kg", "mg", "ml", "l", "case", "crate", "bottle", "Tin Can", "Jar", "plastic"] as const;

type ItemKind = (typeof ITEM_KINDS)[number];
type QtyUnit = (typeof QTY_UNITS)[number];
type SupabaseError = { code?: string; message?: string } | null;
type ItemRecord = Record<string, unknown> & {
  id?: string;
  default_warehouse_id?: string | null;
  has_recipe?: boolean | null;
};

type ItemPayload = {
  name: string;
  sku?: string | null;
  supplier_sku?: string | null;
  item_kind: ItemKind;
  consumption_unit: string;
  consumption_qty_per_base: number;
  stocktake_uom?: string | null;
  qty_decimal_places?: number | null;
  storage_unit?: string | null;
  storage_weight?: number | null;
  cost: number;
  selling_price?: number | null;
  has_variations: boolean;
  has_recipe: boolean;
  outlet_order_visible: boolean;
  image_url?: string | null;
  default_warehouse_id?: string | null;
  menu_group_id?: string | null;
  active: boolean;
  /* legacy fields kept for compatibility with existing not-null constraints */
  consumption_uom?: string;
  purchase_pack_unit?: string;
  units_per_purchase_pack?: number;
  purchase_unit_mass?: number | null;
  purchase_unit_mass_uom?: QtyUnit | null;
  inner_pack_unit_mass?: number | null;
  inner_pack_unit_mass_uom?: QtyUnit | null;
  consumption_unit_mass?: number | null;
  consumption_unit_mass_uom?: QtyUnit | null;
  transfer_unit?: string;
  transfer_quantity?: number;
};

type RecipeRow = {
  finished_item_id: string | null;
  finished_variant_key: string | null;
  active?: boolean | null;
};

type CleanResult<T> = { ok: true; value: T } | { ok: false; error: string };

const CORE_FIELDS =
  "id,name,sku,item_kind,has_variations,active,consumption_uom,purchase_pack_unit,units_per_purchase_pack,cost,outlet_order_visible,image_url";

const OPTIONAL_COLUMNS = [
  "consumption_unit",
  "consumption_qty_per_base",
  "stocktake_uom",
  "storage_unit",
  "storage_weight",
  "purchase_unit_mass",
  "purchase_unit_mass_uom",
  "transfer_unit",
  "transfer_quantity",
  "locked_from_warehouse_id",
  "default_warehouse_id",
  "supplier_sku",
  "selling_price",
  "has_recipe",
  "consumption_unit_mass",
  "consumption_unit_mass_uom",
  "inner_pack_unit_mass",
  "inner_pack_unit_mass_uom",
  "qty_decimal_places",
  "menu_group_id",
] as const;

function selectFields(optional: string[]) {
  const optionalPart = optional.length ? `,${optional.join(",")}` : "";
  return `${CORE_FIELDS}${optionalPart}`;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());
}

function pickQtyUnit(value: unknown, fallback: QtyUnit): QtyUnit {
  if (typeof value === "string") {
    const trimmed = value.trim() as QtyUnit;
    if (QTY_UNITS.includes(trimmed)) return trimmed;
  }
  return fallback;
}

function pickItemKind(value: unknown): CleanResult<ItemKind> {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "product") {
      return { ok: true, value: "finished" };
    }
    if (ITEM_KINDS.includes(trimmed as ItemKind)) {
      return { ok: true, value: trimmed as ItemKind };
    }
  }
  return { ok: false, error: "item_kind must be 'finished', 'ingredient', or 'raw'" };
}

function toNumber(value: unknown, fallback: number, min?: number): CleanResult<number> {
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

function toErrorResponse(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const supabaseError = error as { message?: string; code?: string; details?: string; hint?: string };
    if (supabaseError.code === "23505") {
      return NextResponse.json(
        { error: "SKU already exists. Clear the SKU field and save again to auto-assign the next ID." },
        { status: 409 }
      );
    }
    const message = supabaseError.message?.trim();
    if (message) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
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

async function syncBaseStorageHomes(
  supabase: ReturnType<typeof getServiceClient>,
  itemId: string,
  warehouseIds: string[]
) {
  const normalizedVariantKey = "base";
  const uniqueIds = Array.from(new Set(warehouseIds.filter(Boolean)));
  if (!uniqueIds.length) {
    const { error } = await supabase
      .from("item_storage_homes")
      .delete()
      .eq("item_id", itemId)
      .eq("normalized_variant_key", normalizedVariantKey);
    if (error && !isMissingRelationError(error, "item_storage_homes")) {
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
    if (isMissingRelationError(existingError, "item_storage_homes")) return;
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
    if (error && !isMissingRelationError(error, "item_storage_homes")) {
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
          variant_key: normalizedVariantKey,
          storage_warehouse_id: warehouseId,
        })),
        { onConflict: "item_id,normalized_variant_key,storage_warehouse_id" }
      );
    if (error && !isMissingRelationError(error, "item_storage_homes")) {
      throw new Error(error.message || "Failed to save storage homes");
    }
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() || null;
    const search = url.searchParams.get("q")?.trim().toLowerCase() || "";
    const supabase = getServiceClient();
    const optional = [...OPTIONAL_COLUMNS];
    let data: unknown;
    let error: SupabaseError = null;
    let single = false;
    let useMinimalCore = false;

    while (true) {
      const fieldList = useMinimalCore ? "id,name,sku,item_kind,active" : selectFields(optional);
      const baseSelect = supabase.from("catalog_items").select(fieldList);
      if (id) {
        const result = await baseSelect.eq("id", id).maybeSingle();
        data = result.data;
        error = result.error;
        single = true;
      } else {
        let listQuery = baseSelect.order("name");
        if (search) {
          const searchFilters = [`name.ilike.%${search}%`, `sku.ilike.%${search}%`];
          if (optional.includes("supplier_sku")) {
            searchFilters.push(`supplier_sku.ilike.%${search}%`);
          }
          listQuery = listQuery.or(searchFilters.join(","));
        }
        const result = await listQuery;
        data = Array.isArray(result.data) ? result.data : [];
        error = result.error;
        single = false;
      }

      if (error?.code === "42703" && optional.length) {
        optional.pop();
        continue;
      }
      if (error?.code === "42703" && !useMinimalCore) {
        useMinimalCore = true;
        continue;
      }
      break;
    }

    if (error) throw error;

    const itemsArray = single ? [data as Record<string, unknown>] : (data as Record<string, unknown>[]);
    const itemIds = itemsArray.map((item) => item.id).filter((id): id is string => typeof id === "string");

    let storageHomes: { item_id: string; normalized_variant_key: string; storage_warehouse_id: string }[] = [];
    if (itemIds.length) {
      const { data: storageRows, error: storageErr } = await supabase
        .from("item_storage_homes")
        .select("item_id, normalized_variant_key, storage_warehouse_id")
        .eq("normalized_variant_key", "base")
        .in("item_id", itemIds);
      if (storageErr) {
        if (storageErr.code === "42703") {
          const fallback = await supabase
            .from("item_storage_homes")
            .select("item_id, variant_key, storage_warehouse_id")
            .eq("variant_key", "base")
            .in("item_id", itemIds);
          if (fallback.error && !isMissingRelationError(fallback.error, "item_storage_homes")) {
            throw fallback.error;
          }
          storageHomes = (Array.isArray(fallback.data) ? fallback.data : []).map((row) => ({
            item_id: row.item_id,
            normalized_variant_key: row.variant_key ?? "base",
            storage_warehouse_id: row.storage_warehouse_id,
          }));
        } else if (!isMissingRelationError(storageErr, "item_storage_homes")) {
          throw storageErr;
        }
      } else {
        storageHomes = Array.isArray(storageRows) ? storageRows : [];
      }
    }

    const storageHomeIdsByItem: Record<string, string[]> = {};
    storageHomes.forEach((row) => {
      if (!row?.item_id || !row.storage_warehouse_id) return;
      const list = storageHomeIdsByItem[row.item_id] ?? [];
      if (!list.includes(row.storage_warehouse_id)) {
        list.push(row.storage_warehouse_id);
      }
      storageHomeIdsByItem[row.item_id] = list;
    });

    if (single) {
      if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const item = data as ItemRecord;
      const itemId = typeof item.id === "string" ? item.id : "";
      const defaultWarehouseId = typeof item.default_warehouse_id === "string" ? item.default_warehouse_id : null;
      const storageHomeIds = storageHomeIdsByItem[itemId] ?? [];
      const resolvedStorageHomeIds = buildStorageHomeIds(defaultWarehouseId, storageHomeIds);
      const storageHomeId = resolvedStorageHomeIds[0] ?? null;
      return NextResponse.json({
        item: {
          ...item,
          storage_home_id: storageHomeId,
          storage_home_ids: resolvedStorageHomeIds,
          has_recipe: Boolean(item.has_recipe),
        },
      });
    }

    const enriched = itemsArray.map((item) => {
      const typed = item as ItemRecord;
      const itemId = typeof typed.id === "string" ? typed.id : "";
      const defaultWarehouseId = typeof typed.default_warehouse_id === "string" ? typed.default_warehouse_id : null;
      const storageHomeIds = storageHomeIdsByItem[itemId] ?? [];
      const resolvedStorageHomeIds = buildStorageHomeIds(defaultWarehouseId, storageHomeIds);
      const storageHomeId = resolvedStorageHomeIds[0] ?? null;
      return {
        ...item,
        storage_home_id: storageHomeId,
        storage_home_ids: resolvedStorageHomeIds,
        has_recipe: Boolean(typed.has_recipe),
      };
    });

    return NextResponse.json({ items: enriched });
  } catch (error) {
    console.error("[catalog/items] GET failed", error);
    return NextResponse.json({ error: "Unable to load items" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = cleanText(body.name);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const itemKind = pickItemKind(body.item_kind);
    if (!itemKind.ok) return NextResponse.json({ error: itemKind.error }, { status: 400 });

    const consumptionUnit = cleanText(body.consumption_unit) ?? cleanText(body.consumption_uom) ?? "each";

    const consumptionQtyPerBase = toNumber(body.consumption_qty_per_base, 0, 0);
    if (!consumptionQtyPerBase.ok || consumptionQtyPerBase.value <= 0) {
      return NextResponse.json({ error: "consumption_qty_per_base must be greater than 0" }, { status: 400 });
    }

    const storageUnit = cleanText(body.storage_unit) ?? null;
    let storageWeight: number | null = null;
    if (body.storage_weight !== undefined && body.storage_weight !== null && `${body.storage_weight}`.trim() !== "") {
      const mass = toNumber(body.storage_weight, 0, 0);
      if (!mass.ok) return NextResponse.json({ error: mass.error }, { status: 400 });
      storageWeight = mass.value;
    }

    const cost = toNumber(body.cost ?? 0, 0, -1);
    if (!cost.ok) return NextResponse.json({ error: cost.error }, { status: 400 });

    const sellingPrice = toNumber(body.selling_price ?? 0, 0, -0.0001);
    if (!sellingPrice.ok) return NextResponse.json({ error: sellingPrice.error }, { status: 400 });

    // Legacy-required fields: provide safe defaults to satisfy existing constraints until columns are removed
    const purchasePackUnit = cleanText(body.purchase_pack_unit) ?? storageUnit ?? consumptionUnit;
    const unitsPerPack = toNumber(body.units_per_purchase_pack, 1, 0); // fallback default 1
    const transferUnit = cleanText(body.transfer_unit) ?? storageUnit ?? consumptionUnit;
    const transferQuantity = toNumber(body.transfer_quantity, 1, 0);

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

    let consumptionUnitMassValue: number | null = null;
    if (body.consumption_unit_mass !== undefined && body.consumption_unit_mass !== null && `${body.consumption_unit_mass}`.trim() !== "") {
      const mass = toNumber(body.consumption_unit_mass, 0, 0);
      if (!mass.ok) return NextResponse.json({ error: mass.error }, { status: 400 });
      consumptionUnitMassValue = mass.value;
    }

    let qtyDecimalPlacesValue: number | null = null;
    if (body.qty_decimal_places !== undefined && body.qty_decimal_places !== null && `${body.qty_decimal_places}`.trim() !== "") {
      const places = toNumber(body.qty_decimal_places, 0, -1);
      if (!places.ok) return NextResponse.json({ error: places.error }, { status: 400 });
      qtyDecimalPlacesValue = Math.max(0, Math.min(6, Math.round(places.value)));
    }

    const requestedStorageHomeId = cleanUuid(body.storage_home_id) ?? cleanUuid(body.default_warehouse_id);
    const requestedStorageHomeIds = normalizeStorageHomeIds(body.storage_home_ids);
    const defaultWarehouseId = requestedStorageHomeId ?? requestedStorageHomeIds[0] ?? null;
    const resolvedStorageHomeIds = buildStorageHomeIds(defaultWarehouseId, requestedStorageHomeIds);
    const menuGroupId = cleanUuid(body.menu_group_id);

    const supabase = getServiceClient();
    let resolvedSku = cleanText(body.sku) ?? null;
    if (itemKind.value === "finished") {
      resolvedSku = await allocatePosItemSku(supabase, resolvedSku);
    }

    const payload: ItemPayload = {
      name,
      sku: resolvedSku ?? null,
      supplier_sku: cleanText(body.supplier_sku) ?? null,
      item_kind: itemKind.value,
      consumption_unit: consumptionUnit,
      consumption_qty_per_base: consumptionQtyPerBase.value,
      stocktake_uom: cleanText(body.stocktake_uom) ?? null,
      qty_decimal_places: qtyDecimalPlacesValue,
      storage_unit: storageUnit,
      storage_weight: storageWeight,
      cost: cost.value,
      selling_price: sellingPrice.value,
      has_variations: cleanBoolean(body.has_variations, false),
      has_recipe: cleanBoolean(body.has_recipe, false),
      outlet_order_visible: cleanBoolean(body.outlet_order_visible, true),
      image_url: cleanText(body.image_url) ?? null,
      default_warehouse_id: defaultWarehouseId,
      menu_group_id: menuGroupId,
      active: cleanBoolean(body.active, true),
      // legacy columns kept filled to satisfy constraints
      consumption_uom: consumptionUnit,
      purchase_pack_unit: purchasePackUnit,
      units_per_purchase_pack: unitsPerPack.ok ? unitsPerPack.value || 1 : 1,
      purchase_unit_mass: purchaseUnitMass,
      purchase_unit_mass_uom: purchaseUnitMass ? pickQtyUnit(body.purchase_unit_mass_uom, "kg") : null,
      inner_pack_unit_mass: innerPackUnitMass,
      inner_pack_unit_mass_uom: innerPackUnitMass ? pickQtyUnit(body.inner_pack_unit_mass_uom, "kg") : null,
      consumption_unit_mass: consumptionUnitMassValue,
      consumption_unit_mass_uom:
        consumptionUnitMassValue !== null && consumptionUnitMassValue !== undefined
          ? pickQtyUnit(body.consumption_unit_mass_uom, "kg")
          : null,
      transfer_unit: transferUnit,
      transfer_quantity: transferQuantity.ok ? transferQuantity.value || 1 : 1,
    };

    let attemptPayload: Partial<ItemPayload> = payload;
    const optionalKeys = [...OPTIONAL_COLUMNS];
    let data: { id?: string } | null = null;
    let error: SupabaseError = null;

    while (true) {
      const result = await supabase
        .from("catalog_items")
        .insert([attemptPayload])
        .select("id,name,sku,item_kind")
        .single();
      data = (result.data as { id?: string } | null) ?? null;
      error = (result.error as SupabaseError) ?? null;

      if (error?.code === "42703" && optionalKeys.length) {
        const removeKey = optionalKeys.shift();
        if (removeKey) {
          const { [removeKey]: removed, ...rest } = attemptPayload as Record<string, unknown>;
          void removed;
          attemptPayload = rest as Partial<ItemPayload>;
          continue;
        }
      }
      break;
    }

    if (error) throw error;

    const storageHomeId = defaultWarehouseId;
    if (!data?.id) {
      throw new Error("Item insert failed to return id");
    }
    try {
      await syncBaseStorageHomes(supabase, data.id as string, resolvedStorageHomeIds);
    } catch (storageError) {
      console.error("[catalog/items] storage home upsert failed", storageError);
    }

    const actor = parseCatalogChangeActor(request);
    await recordCatalogChangeEvent(supabase, {
      operation: "insert",
      entityType: "item",
      entityId: data.id as string,
      entityName: name,
      sku: resolvedSku ?? (data.sku as string | null) ?? null,
      menuGroupId: menuGroupId,
      actor,
      after: { name, selling_price: sellingPrice.value, cost: cost.value, sku: resolvedSku, menu_group_id: menuGroupId, active: payload.active, item_kind: itemKind.value },
      trackedFields: [...ITEM_TRACKED_FIELDS],
    });

    return NextResponse.json({
      item: {
        ...data,
        sku: resolvedSku ?? data.sku ?? null,
        storage_home_id: storageHomeId,
        storage_home_ids: resolvedStorageHomeIds,
      },
    });
  } catch (error) {
    console.error("[catalog/items] POST failed", error);
    return toErrorResponse(error, "Unable to create item");
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = cleanText(body.id);
    if (!id || !isUuid(id)) return NextResponse.json({ error: "id is required for update" }, { status: 400 });

    const name = cleanText(body.name);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const itemKind = pickItemKind(body.item_kind);
    if (!itemKind.ok) return NextResponse.json({ error: itemKind.error }, { status: 400 });

    const consumptionUnit = cleanText(body.consumption_unit) ?? cleanText(body.consumption_uom) ?? "each";

    const consumptionQtyPerBase = toNumber(body.consumption_qty_per_base, 0, 0);
    if (!consumptionQtyPerBase.ok || consumptionQtyPerBase.value <= 0) {
      return NextResponse.json({ error: "consumption_qty_per_base must be greater than 0" }, { status: 400 });
    }

    const storageUnit = cleanText(body.storage_unit) ?? null;
    let storageWeight: number | null = null;
    if (body.storage_weight !== undefined && body.storage_weight !== null && `${body.storage_weight}`.trim() !== "") {
      const mass = toNumber(body.storage_weight, 0, 0);
      if (!mass.ok) return NextResponse.json({ error: mass.error }, { status: 400 });
      storageWeight = mass.value;
    }

    const cost = toNumber(body.cost ?? 0, 0, -1);
    if (!cost.ok) return NextResponse.json({ error: cost.error }, { status: 400 });

    const sellingPrice = toNumber(body.selling_price ?? 0, 0, -0.0001);
    if (!sellingPrice.ok) return NextResponse.json({ error: sellingPrice.error }, { status: 400 });

    const purchasePackUnit = cleanText(body.purchase_pack_unit) ?? storageUnit ?? consumptionUnit;
    const unitsPerPack = toNumber(body.units_per_purchase_pack, 1, 0);
    const transferUnit = cleanText(body.transfer_unit) ?? storageUnit ?? consumptionUnit;
    const transferQuantity = toNumber(body.transfer_quantity, 1, 0);

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

    let consumptionUnitMassValue: number | null = null;
    if (body.consumption_unit_mass !== undefined && body.consumption_unit_mass !== null && `${body.consumption_unit_mass}`.trim() !== "") {
      const mass = toNumber(body.consumption_unit_mass, 0, 0);
      if (!mass.ok) return NextResponse.json({ error: mass.error }, { status: 400 });
      consumptionUnitMassValue = mass.value;
    }

    let qtyDecimalPlacesValue: number | null = null;
    if (body.qty_decimal_places !== undefined && body.qty_decimal_places !== null && `${body.qty_decimal_places}`.trim() !== "") {
      const places = toNumber(body.qty_decimal_places, 0, -1);
      if (!places.ok) return NextResponse.json({ error: places.error }, { status: 400 });
      qtyDecimalPlacesValue = Math.max(0, Math.min(6, Math.round(places.value)));
    }

    const requestedStorageHomeId = cleanUuid(body.storage_home_id) ?? cleanUuid(body.default_warehouse_id);
    const requestedStorageHomeIds = normalizeStorageHomeIds(body.storage_home_ids);
    const defaultWarehouseId = requestedStorageHomeId ?? requestedStorageHomeIds[0] ?? null;
    const resolvedStorageHomeIds = buildStorageHomeIds(defaultWarehouseId, requestedStorageHomeIds);
    const menuGroupId = cleanUuid(body.menu_group_id);

    const payload: ItemPayload = {
      name,
      sku: cleanText(body.sku) ?? null,
      supplier_sku: cleanText(body.supplier_sku) ?? null,
      item_kind: itemKind.value,
      consumption_unit: consumptionUnit,
      consumption_qty_per_base: consumptionQtyPerBase.value,
      stocktake_uom: cleanText(body.stocktake_uom) ?? null,
      qty_decimal_places: qtyDecimalPlacesValue,
      storage_unit: storageUnit,
      storage_weight: storageWeight,
      cost: cost.value,
      selling_price: sellingPrice.value,
      has_variations: cleanBoolean(body.has_variations, false),
      has_recipe: cleanBoolean(body.has_recipe, false),
      outlet_order_visible: cleanBoolean(body.outlet_order_visible, true),
      image_url: cleanText(body.image_url) ?? null,
      default_warehouse_id: defaultWarehouseId,
      menu_group_id: menuGroupId,
      active: cleanBoolean(body.active, true),
      consumption_uom: consumptionUnit,
      purchase_pack_unit: purchasePackUnit,
      units_per_purchase_pack: unitsPerPack.ok ? unitsPerPack.value || 1 : 1,
      purchase_unit_mass: purchaseUnitMass,
      purchase_unit_mass_uom: purchaseUnitMass ? pickQtyUnit(body.purchase_unit_mass_uom, "kg") : null,
      inner_pack_unit_mass: innerPackUnitMass,
      inner_pack_unit_mass_uom: innerPackUnitMass ? pickQtyUnit(body.inner_pack_unit_mass_uom, "kg") : null,
      consumption_unit_mass: consumptionUnitMassValue,
      consumption_unit_mass_uom:
        consumptionUnitMassValue !== null && consumptionUnitMassValue !== undefined
          ? pickQtyUnit(body.consumption_unit_mass_uom, "kg")
          : null,
      transfer_unit: transferUnit,
      transfer_quantity: transferQuantity.ok ? transferQuantity.value || 1 : 1,
    };

    const supabase = getServiceClient();
    const { data: existingRow, error: existingError } = await supabase
      .from("catalog_items")
      .select("id,name,sku,selling_price,cost,menu_group_id,active,item_kind")
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existingRow) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    let attemptPayload: Partial<ItemPayload> = payload;
    const optionalKeys = [...OPTIONAL_COLUMNS];
    let data: { id?: string; name?: string; sku?: string | null } | null = null;
    let error: SupabaseError = null;

    while (true) {
      const result = await supabase
        .from("catalog_items")
        .update(attemptPayload)
        .eq("id", id)
        .select("id,name,sku,item_kind,selling_price,cost,menu_group_id,active")
        .single();
      data = (result.data as { id?: string } | null) ?? null;
      error = (result.error as SupabaseError) ?? null;

      if (error?.code === "42703" && optionalKeys.length) {
        const removeKey = optionalKeys.shift();
        if (removeKey) {
          const { [removeKey]: removed, ...rest } = attemptPayload as Record<string, unknown>;
          void removed;
          attemptPayload = rest as Partial<ItemPayload>;
          continue;
        }
      }
      break;
    }

    if (error) throw error;

    const storageHomeId = defaultWarehouseId;
    if (!data?.id) {
      throw new Error("Item update failed to return id");
    }
    try {
      await syncBaseStorageHomes(supabase, data.id as string, resolvedStorageHomeIds);
    } catch (storageError) {
      console.error("[catalog/items] storage home upsert failed", storageError);
    }

    const actor = parseCatalogChangeActor(request);
    await recordCatalogChangeEvent(supabase, {
      operation: "update",
      entityType: "item",
      entityId: id,
      entityName: name,
      sku: cleanText(body.sku) ?? (data.sku as string | null) ?? null,
      menuGroupId: menuGroupId,
      before: existingRow as Record<string, unknown>,
      after: {
        name,
        selling_price: sellingPrice.value,
        cost: cost.value,
        sku: cleanText(body.sku) ?? null,
        menu_group_id: menuGroupId,
        active: payload.active,
        item_kind: itemKind.value,
      },
      trackedFields: [...ITEM_TRACKED_FIELDS],
      actor,
    });

    return NextResponse.json({ item: { ...data, storage_home_id: storageHomeId, storage_home_ids: resolvedStorageHomeIds } });
  } catch (error) {
    console.error("[catalog/items] PUT failed", error);
    return toErrorResponse(error, "Unable to update item");
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    let id = url.searchParams.get("id")?.trim() || "";
    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = typeof body.id === "string" ? body.id.trim() : "";
    }

    if (!id || !isUuid(id)) return NextResponse.json({ error: "Valid id is required for delete" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: existingRow, error: existingError } = await supabase
      .from("catalog_items")
      .select("id,name,sku,selling_price,cost,menu_group_id,active,item_kind")
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existingRow) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const { data, error } = await supabase.from("catalog_items").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw error;

    if (!data) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const actor = parseCatalogChangeActor(request);
    await recordCatalogChangeEvent(supabase, {
      operation: "delete",
      entityType: "item",
      entityId: id,
      entityName: existingRow.name as string,
      sku: (existingRow.sku as string | null) ?? null,
      menuGroupId: (existingRow.menu_group_id as string | null) ?? null,
      before: existingRow as Record<string, unknown>,
      trackedFields: [...ITEM_TRACKED_FIELDS],
      actor,
    });

    return NextResponse.json({ id: data.id });
  } catch (error) {
    console.error("[catalog/items] DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete item" }, { status: 500 });
  }
}
