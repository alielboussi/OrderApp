import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

const ITEM_KINDS = ["finished", "ingredient", "raw"] as const;
const QTY_UNITS = ["each", "g", "kg", "mg", "ml", "l", "case", "crate", "bottle", "Tin Can", "Jar", "plastic"] as const;

type ItemKind = (typeof ITEM_KINDS)[number];
type QtyUnit = (typeof QTY_UNITS)[number];

type ItemPayload = {
  name: string;
  sku?: string | null;
  item_kind: ItemKind;
  consumption_unit: string;
  consumption_qty_per_base: number;
  stocktake_uom?: string | null;
  qty_decimal_places?: number | null;
  storage_unit?: string | null;
  storage_weight?: number | null;
  cost: number;
  has_variations: boolean;
  has_recipe: boolean;
  outlet_order_visible: boolean;
  image_url?: string | null;
  default_warehouse_id?: string | null;
  active: boolean;
  /* legacy fields kept for compatibility with existing not-null constraints */
  consumption_uom?: string;
  purchase_pack_unit?: string;
  units_per_purchase_pack?: number;
  purchase_unit_mass?: number | null;
  purchase_unit_mass_uom?: QtyUnit | null;
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

const BASE_FIELDS =
  "id,name,sku,item_kind,has_variations,active,consumption_unit,consumption_qty_per_base,stocktake_uom,storage_unit,storage_weight,consumption_uom,purchase_pack_unit,units_per_purchase_pack,purchase_unit_mass,purchase_unit_mass_uom,transfer_unit,transfer_quantity,cost,locked_from_warehouse_id,outlet_order_visible,image_url,default_warehouse_id,active";

const OPTIONAL_COLUMNS = [
  "has_recipe",
  "consumption_unit_mass",
  "consumption_unit_mass_uom",
  "storage_unit",
  "storage_weight",
  "qty_decimal_places",
] as const;

function selectFields(optional: string[]) {
  const optionalPart = optional.length ? `,${optional.join(",")}` : "";
  return `${BASE_FIELDS}${optionalPart}`;
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

const normalizeVariantKey = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized && normalized.length ? normalized : "base";
};

async function upsertBaseStorageHome(
  supabase: ReturnType<typeof getServiceClient>,
  itemId: string,
  warehouseId: string | null
) {
  const normalizedVariantKey = "base";
  if (!warehouseId) {
    await supabase
      .from("item_storage_homes")
      .delete()
      .eq("item_id", itemId)
      .eq("normalized_variant_key", normalizedVariantKey);
    return;
  }

  await supabase
    .from("item_storage_homes")
    .upsert(
      {
        item_id: itemId,
        variant_key: normalizedVariantKey,
        storage_warehouse_id: warehouseId,
      },
      { onConflict: "item_id,normalized_variant_key" }
    );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() || null;
    const search = url.searchParams.get("q")?.trim().toLowerCase() || "";
    const supabase = getServiceClient();
    let optional = [...OPTIONAL_COLUMNS];
    let data: unknown;
    let error: any;
    let single = false;

    while (true) {
      const baseSelect = supabase.from("catalog_items").select(selectFields(optional));
      if (id) {
        const result = await baseSelect.eq("id", id).maybeSingle();
        data = result.data;
        error = result.error;
        single = true;
      } else {
        let listQuery = baseSelect.order("name");
        if (search) listQuery = listQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
        const result = await listQuery;
        data = Array.isArray(result.data) ? result.data : [];
        error = result.error;
        single = false;
      }

      if (error?.code === "42703" && optional.length) {
        optional.pop();
        continue;
      }
      break;
    }

    if (error) throw error;

    // Enrich with recipe counts (active recipes only)
    const { data: recipeRows, error: recipeError } = await supabase
      .from("recipes")
      .select("finished_item_id, finished_variant_key, active")
      .eq("active", true);
    if (recipeError) throw recipeError;

    const normalizeVariant = (key: string | null | undefined) => (key && key.trim() ? key.trim() : "base");
    const recipeCountByItem: Record<string, number> = {};
    const recipeCountByItemVariant: Record<string, number> = {};

    (recipeRows as RecipeRow[] | null)?.forEach((row) => {
      if (!row.finished_item_id) return;
      const variantKey = normalizeVariant(row.finished_variant_key);
      const itemKey = row.finished_item_id;
      const comboKey = `${itemKey}::${variantKey}`;
      recipeCountByItem[itemKey] = (recipeCountByItem[itemKey] || 0) + 1;
      recipeCountByItemVariant[comboKey] = (recipeCountByItemVariant[comboKey] || 0) + 1;
    });

    const itemsArray = single ? [data as Record<string, unknown>] : (data as Record<string, unknown>[]);
    const itemIds = itemsArray.map((item) => item.id).filter((id): id is string => typeof id === "string");

    let storageHomes: { item_id: string; normalized_variant_key: string; storage_warehouse_id: string }[] = [];
    if (itemIds.length) {
      const { data: storageRows, error: storageErr } = await supabase
        .from("item_storage_homes")
        .select("item_id, normalized_variant_key, storage_warehouse_id")
        .eq("normalized_variant_key", "base")
        .in("item_id", itemIds);
      if (storageErr) throw storageErr;
      storageHomes = Array.isArray(storageRows) ? storageRows : [];
    }

    const storageHomeByItem: Record<string, string | null> = {};
    storageHomes.forEach((row) => {
      if (row?.item_id) storageHomeByItem[row.item_id] = row.storage_warehouse_id;
    });

    if (single) {
      if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const item = data as Record<string, unknown>;
      const baseCount = recipeCountByItemVariant[`${item.id as string}::base`] || 0;
      const storageHomeId = storageHomeByItem[item.id as string] ?? (item as any).default_warehouse_id ?? null;
      return NextResponse.json({
        item: {
          ...item,
          storage_home_id: storageHomeId,
          has_recipe: (item as any).has_recipe ?? recipeCountByItem[item.id as string] > 0,
          base_recipe_count: baseCount,
        },
      });
    }

    const enriched = itemsArray.map((item) => {
      const baseCount = recipeCountByItemVariant[`${item.id as string}::base`] || 0;
      const storageHomeId = storageHomeByItem[item.id as string] ?? (item as any).default_warehouse_id ?? null;
      return {
        ...item,
        storage_home_id: storageHomeId,
        has_recipe: (item as any).has_recipe ?? recipeCountByItem[item.id as string] > 0,
        base_recipe_count: baseCount,
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

    const payload: ItemPayload = {
      name,
      sku: cleanText(body.sku) ?? null,
      item_kind: itemKind.value,
      consumption_unit: consumptionUnit,
      consumption_qty_per_base: consumptionQtyPerBase.value,
      stocktake_uom: cleanText(body.stocktake_uom) ?? null,
      qty_decimal_places: qtyDecimalPlacesValue,
      storage_unit: storageUnit,
      storage_weight: storageWeight,
      cost: cost.value,
      has_variations: cleanBoolean(body.has_variations, false),
      has_recipe: cleanBoolean(body.has_recipe, false),
      outlet_order_visible: cleanBoolean(body.outlet_order_visible, true),
      image_url: cleanText(body.image_url) ?? null,
      default_warehouse_id: requestedStorageHomeId,
      active: cleanBoolean(body.active, true),
      // legacy columns kept filled to satisfy constraints
      consumption_uom: consumptionUnit,
      purchase_pack_unit: purchasePackUnit,
      units_per_purchase_pack: unitsPerPack.ok ? unitsPerPack.value || 1 : 1,
      purchase_unit_mass: purchaseUnitMass,
      purchase_unit_mass_uom: purchaseUnitMass ? pickQtyUnit(body.purchase_unit_mass_uom, "kg") : null,
      consumption_unit_mass: consumptionUnitMassValue,
      consumption_unit_mass_uom:
        consumptionUnitMassValue !== null && consumptionUnitMassValue !== undefined
          ? pickQtyUnit(body.consumption_unit_mass_uom, "kg")
          : null,
      transfer_unit: transferUnit,
      transfer_quantity: transferQuantity.ok ? transferQuantity.value || 1 : 1,
    };

    const supabase = getServiceClient();
    let attemptPayload: Partial<ItemPayload> = payload;
    let optionalKeys = [...OPTIONAL_COLUMNS];
    let data;
    let error: any;

    while (true) {
      ({ data, error } = await supabase
        .from("catalog_items")
        .insert([attemptPayload])
        .select("id,name,sku,item_kind")
        .single());

      if (error?.code === "42703" && optionalKeys.length) {
        const removeKey = optionalKeys.shift();
        if (removeKey) {
          const { [removeKey]: _removed, ...rest } = attemptPayload as Record<string, unknown>;
          attemptPayload = rest as Partial<ItemPayload>;
          continue;
        }
      }
      break;
    }

    if (error) throw error;

    const storageHomeId = requestedStorageHomeId ?? null;
    if (!data?.id) {
      throw new Error("Item insert failed to return id");
    }
    try {
      await upsertBaseStorageHome(supabase, data.id as string, storageHomeId);
    } catch (storageError) {
      console.error("[catalog/items] storage home upsert failed", storageError);
    }

    return NextResponse.json({ item: { ...data, storage_home_id: storageHomeId } });
  } catch (error) {
    console.error("[catalog/items] POST failed", error);
    return NextResponse.json({ error: "Unable to create item" }, { status: 500 });
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

    const payload: ItemPayload = {
      name,
      sku: cleanText(body.sku) ?? null,
      item_kind: itemKind.value,
      consumption_unit: consumptionUnit,
      consumption_qty_per_base: consumptionQtyPerBase.value,
      stocktake_uom: cleanText(body.stocktake_uom) ?? null,
      qty_decimal_places: qtyDecimalPlacesValue,
      storage_unit: storageUnit,
      storage_weight: storageWeight,
      cost: cost.value,
      has_variations: cleanBoolean(body.has_variations, false),
      has_recipe: cleanBoolean(body.has_recipe, false),
      outlet_order_visible: cleanBoolean(body.outlet_order_visible, true),
      image_url: cleanText(body.image_url) ?? null,
      default_warehouse_id: requestedStorageHomeId,
      active: cleanBoolean(body.active, true),
      consumption_uom: consumptionUnit,
      purchase_pack_unit: purchasePackUnit,
      units_per_purchase_pack: unitsPerPack.ok ? unitsPerPack.value || 1 : 1,
      purchase_unit_mass: purchaseUnitMass,
      purchase_unit_mass_uom: purchaseUnitMass ? pickQtyUnit(body.purchase_unit_mass_uom, "kg") : null,
      consumption_unit_mass: consumptionUnitMassValue,
      consumption_unit_mass_uom:
        consumptionUnitMassValue !== null && consumptionUnitMassValue !== undefined
          ? pickQtyUnit(body.consumption_unit_mass_uom, "kg")
          : null,
      transfer_unit: transferUnit,
      transfer_quantity: transferQuantity.ok ? transferQuantity.value || 1 : 1,
    };

    const supabase = getServiceClient();
    let attemptPayload: Partial<ItemPayload> = payload;
    let optionalKeys = [...OPTIONAL_COLUMNS];
    let data;
    let error: any;

    while (true) {
      ({ data, error } = await supabase
        .from("catalog_items")
        .update(attemptPayload)
        .eq("id", id)
        .select("id,name,sku,item_kind")
        .single());

      if (error?.code === "42703" && optionalKeys.length) {
        const removeKey = optionalKeys.shift();
        if (removeKey) {
          const { [removeKey]: _removed, ...rest } = attemptPayload as Record<string, unknown>;
          attemptPayload = rest as Partial<ItemPayload>;
          continue;
        }
      }
      break;
    }

    if (error) throw error;

    const storageHomeId = requestedStorageHomeId ?? null;
    if (!data?.id) {
      throw new Error("Item update failed to return id");
    }
    try {
      await upsertBaseStorageHome(supabase, data.id as string, storageHomeId);
    } catch (storageError) {
      console.error("[catalog/items] storage home upsert failed", storageError);
    }

    return NextResponse.json({ item: { ...data, storage_home_id: storageHomeId } });
  } catch (error) {
    console.error("[catalog/items] PUT failed", error);
    return NextResponse.json({ error: "Unable to update item" }, { status: 500 });
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
    const { data, error } = await supabase.from("catalog_items").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw error;

    if (!data) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    return NextResponse.json({ id: data.id });
  } catch (error) {
    console.error("[catalog/items] DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete item" }, { status: 500 });
  }
}
