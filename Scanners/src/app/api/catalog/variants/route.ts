import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

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
  stocktake_uom?: string | null;
  purchase_pack_unit: string;
  units_per_purchase_pack: number;
  purchase_unit_mass?: number | null;
  purchase_unit_mass_uom?: QtyUnit | null;
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

type CatalogVariantRow = VariantPayload & {
  id: string;
  item_id: string;
};

const normalizeVariantKey = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized && normalized.length ? normalized : "base";
};

const VARIANT_BASE_FIELDS =
  "id,item_id,name,item_kind,consumption_uom,purchase_pack_unit,units_per_purchase_pack,transfer_unit,transfer_quantity,cost,outlet_order_visible,active";

const VARIANT_OPTIONAL_FIELDS = [
  "sku",
  "supplier_sku",
  "stocktake_uom",
  "purchase_unit_mass",
  "purchase_unit_mass_uom",
  "qty_decimal_places",
  "selling_price",
  "locked_from_warehouse_id",
  "image_url",
  "default_warehouse_id",
] as const;

function selectVariantFields(optional: readonly string[]) {
  const optionalPart = optional.length ? `,${optional.join(",")}` : "";
  return `${VARIANT_BASE_FIELDS}${optionalPart}`;
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
    stocktake_uom: row.stocktake_uom ?? null,
    purchase_pack_unit: row.purchase_pack_unit ?? "each",
    units_per_purchase_pack: row.units_per_purchase_pack ?? 1,
    purchase_unit_mass: row.purchase_unit_mass ?? null,
    purchase_unit_mass_uom: row.purchase_unit_mass_uom ?? null,
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

async function upsertVariantStorageHome(
  supabase: ReturnType<typeof getServiceClient>,
  itemId: string,
  variantKey: string,
  warehouseId: string | null
) {
  const normalizedVariantKey = normalizeVariantKey(variantKey);
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
        variant_key: variantKey,
        normalized_variant_key: normalizedVariantKey,
        storage_warehouse_id: warehouseId,
      },
      { onConflict: "item_id,normalized_variant_key" }
    );
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
    stocktake_uom: payload.stocktake_uom ?? null,
    purchase_pack_unit: payload.purchase_pack_unit ?? "each",
    units_per_purchase_pack: payload.units_per_purchase_pack ?? 1,
    purchase_unit_mass: payload.purchase_unit_mass ?? null,
    purchase_unit_mass_uom: payload.purchase_unit_mass_uom ?? null,
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
    const url = new URL(request.url);
    const itemId = url.searchParams.get("item_id")?.trim() || undefined;
    const id = url.searchParams.get("id")?.trim() || undefined;
    const search = url.searchParams.get("q")?.trim().toLowerCase() || "";
    const supabase = getServiceClient();
    let itemIds: string[] = [];
    if (itemId) {
      let itemRow: { id?: string; active?: boolean | null } | null = null;
      let itemError: any = null;
      const primary = await supabase.from("catalog_items").select("id,active").eq("id", itemId).maybeSingle();
      itemRow = (primary.data as typeof itemRow) ?? null;
      itemError = primary.error;
      if (itemError?.code === "42703") {
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
    } else {
      let itemRows: { id?: string }[] | null = null;
      let itemsError: any = null;
      const primary = await supabase.from("catalog_items").select("id").eq("active", true);
      itemRows = (primary.data as typeof itemRows) ?? null;
      itemsError = primary.error;
      if (itemsError?.code === "42703") {
        const fallback = await supabase.from("catalog_items").select("id");
        itemRows = (fallback.data as typeof itemRows) ?? null;
        itemsError = fallback.error;
      }
      if (itemsError) throw itemsError;
      itemIds = (itemRows ?? []).map((row: any) => row.id).filter(Boolean);
    }

    if (itemIds.length === 0 && !id) {
      return NextResponse.json({ variants: [] });
    }

    let optional = [...VARIANT_OPTIONAL_FIELDS];
    let variantRows: Partial<CatalogVariantRow>[] | null = null;
    let variantError: any = null;

    while (true) {
      let variantQuery = supabase.from("catalog_variants").select(selectVariantFields(optional));
      if (itemIds.length) variantQuery = variantQuery.in("item_id", itemIds);
      if (id) variantQuery = variantQuery.eq("id", id);

      const result = (await variantQuery) as {
        data: Partial<CatalogVariantRow>[] | null;
        error: any | null;
      };
      variantRows = result.data;
      variantError = result.error;

      if (variantError?.code === "42703" && optional.length) {
        optional.pop();
        continue;
      }
      break;
    }

    if (variantError) throw variantError;

    const normalizeVariant = (key: string | null | undefined) => (key && key.trim() ? key.trim() : "base");

    let recipeRows: RecipeRow[] | null = null;
    let recipeError: any = null;
    while (true) {
      let recipeQuery = supabase.from("recipes").select("finished_item_id, finished_variant_key");
      if (itemIds.length) recipeQuery = recipeQuery.in("finished_item_id", itemIds);
      recipeQuery = recipeQuery.eq("active", true);

      const result = await recipeQuery;
      recipeRows = (result.data as RecipeRow[] | null) ?? null;
      recipeError = result.error;

      if (recipeError?.code === "42703") {
        const minimal = await supabase.from("recipes").select("finished_item_id");
        recipeRows = (minimal.data as RecipeRow[] | null) ?? null;
        recipeError = minimal.error;
      }

      if (recipeError?.code === "42P01") {
        recipeRows = [];
        recipeError = null;
      }
      break;
    }
    if (recipeError) throw recipeError;

    const recipeCountByVariant: Record<string, number> = {};
    (recipeRows as RecipeRow[] | null)?.forEach((row) => {
      if (!row.finished_item_id) return;
      const comboKey = `${row.finished_item_id}::${normalizeVariant(row.finished_variant_key)}`;
      recipeCountByVariant[comboKey] = (recipeCountByVariant[comboKey] || 0) + 1;
    });

    const variants = (variantRows ?? [])
      .map((row) => normalizeVariantRow(row))
      .filter((variant) => normalizeVariantKey(variant.id) !== "base")
      .map((variant) => {
        const normalizedKey = normalizeVariant(variant.id);
        const hasRecipe = recipeCountByVariant[`${variant.item_id}::${normalizedKey}`] > 0;
        return {
          ...variant,
          has_recipe: hasRecipe,
        };
      });

    const storageHomeByKey: Record<string, string | null> = {};
    if (itemIds.length) {
      let storageRows: {
        item_id?: string;
        normalized_variant_key?: string | null;
        variant_key?: string | null;
        storage_warehouse_id?: string | null;
      }[] = [];
      let storageErr: any = null;

      const primary = await supabase
        .from("item_storage_homes")
        .select("item_id, normalized_variant_key, storage_warehouse_id")
        .in("item_id", itemIds);
      storageRows = (primary.data as typeof storageRows) ?? [];
      storageErr = primary.error;

      if (storageErr?.code === "42703") {
        const fallback = await supabase
          .from("item_storage_homes")
          .select("item_id, variant_key, storage_warehouse_id")
          .in("item_id", itemIds);
        storageRows = (fallback.data as typeof storageRows) ?? [];
        storageErr = fallback.error;
      }

      if (storageErr?.code === "42P01") {
        storageRows = [];
        storageErr = null;
      }

      if (storageErr) throw storageErr;
      storageRows.forEach((row) => {
        const rawKey = row?.normalized_variant_key ?? row?.variant_key ?? null;
        const normalizedKey = normalizeVariantKey(rawKey ?? undefined);
        if (row?.item_id && normalizedKey) {
          storageHomeByKey[`${row.item_id}::${normalizedKey}`] = row.storage_warehouse_id ?? null;
        }
      });
    }

    const variantsWithStorage = variants.map((variant) => {
      const normalizedKey = normalizeVariant(variant.id);
      const storageKey = `${variant.item_id}::${normalizedKey}`;
      const storageHomeId = storageHomeByKey[storageKey] ?? variant.default_warehouse_id ?? null;
      return { ...variant, storage_home_id: storageHomeId };
    });

    if (id) {
      const found = variantsWithStorage.find((variant) => variant.id === id && (!itemId || variant.item_id === itemId));
      if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ variant: found });
    }

    const filtered = search
      ? variantsWithStorage.filter((variant) => {
          const name = variant.name?.toLowerCase?.() ?? "";
          const sku = variant.sku?.toLowerCase?.() ?? "";
          const supplierSku = (variant as any).supplier_sku?.toLowerCase?.() ?? "";
          return name.includes(search) || sku.includes(search) || supplierSku.includes(search);
        })
      : variantsWithStorage;

    return NextResponse.json({ variants: filtered });
  } catch (error) {
    const details = toErrorDetails(error);
    console.error("[catalog/variants] GET failed", details);
    return NextResponse.json({ error: "Unable to load variants", details }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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
    let qtyDecimalPlaces: number | null = null;
    if (body.qty_decimal_places !== undefined && body.qty_decimal_places !== null && `${body.qty_decimal_places}`.trim() !== "") {
      const places = toNumber(body.qty_decimal_places, 0, -1);
      if (!places.ok) return NextResponse.json({ error: places.error }, { status: 400 });
      qtyDecimalPlaces = Math.max(0, Math.min(6, Math.round(places.value)));
    }

    const supabase = getServiceClient();
    const { data: itemRow, error: itemError } = (await supabase
      .from("catalog_items")
      .select("id,item_kind")
      .eq("id", itemId)
      .maybeSingle()) as { data: { id: string; item_kind?: ItemKind | null } | null; error: Error | null };
    if (itemError) throw itemError;
    if (!itemRow) return NextResponse.json({ error: "Parent product not found" }, { status: 404 });

    const payload: VariantPayload = {
      item_id: itemId,
      name,
      sku: cleanText(body.sku) ?? null,
      supplier_sku: cleanText(body.supplier_sku) ?? null,
      item_kind: cleanItemKind(body.item_kind, itemRow?.item_kind ?? "finished"),
      consumption_uom: consumptionUom,
      stocktake_uom: cleanText(body.stocktake_uom) ?? null,
      purchase_pack_unit: purchasePackUnit,
      units_per_purchase_pack: unitsPerPack.value,
      purchase_unit_mass: purchaseUnitMass,
      purchase_unit_mass_uom: purchaseUnitMass ? pickQtyUnit(body.purchase_unit_mass_uom, "kg") : null,
      transfer_unit: transferUnit,
      transfer_quantity: transferQuantity.value,
      qty_decimal_places: qtyDecimalPlaces,
      cost: cost.value,
      selling_price: sellingPrice.value,
      locked_from_warehouse_id: cleanUuid(body.locked_from_warehouse_id),
      outlet_order_visible: cleanBoolean(body.outlet_order_visible, true),
      image_url: cleanText(body.image_url) ?? null,
      default_warehouse_id: cleanUuid(body.default_warehouse_id),
      active: cleanBoolean(body.active, true),
    };

    const providedId = cleanText(body.id) ?? cleanText(body.key);
    const variantId = providedId ?? randomUUID();
    if (normalizeVariantKey(variantId) === "base") {
      return NextResponse.json({ error: "Variant key cannot be base" }, { status: 400 });
    }

    const { error: insertError } = await supabase.from("catalog_variants").insert({
      id: variantId,
      ...payload,
    });
    if (insertError) throw insertError;

    await refreshHasVariations(supabase, itemId);

    const responseVariant = toVariantResponse(variantId, payload);
    if (!responseVariant) return NextResponse.json({ error: "Failed to save variant" }, { status: 500 });

    try {
      await upsertVariantStorageHome(supabase, itemId, responseVariant.id, responseVariant.default_warehouse_id ?? null);
    } catch (storageError) {
      console.error("[catalog/variants] storage home upsert failed", storageError);
    }

    return NextResponse.json({ variant: { ...responseVariant, storage_home_id: responseVariant.default_warehouse_id ?? null } });
  } catch (error) {
    console.error("[catalog/variants] POST failed", error);
    return NextResponse.json({ error: "Unable to create variant" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = cleanText(body.id);
    if (!id) return NextResponse.json({ error: "id is required for update" }, { status: 400 });

    const itemId = cleanUuid(body.item_id);
    const supabase = getServiceClient();
    const { data: existing, error: existingError } = await supabase
      .from("catalog_variants")
      .select(
        "id,item_id,name,sku,supplier_sku,item_kind,consumption_uom,stocktake_uom,purchase_pack_unit,units_per_purchase_pack,purchase_unit_mass,purchase_unit_mass_uom,transfer_unit,transfer_quantity,qty_decimal_places,cost,selling_price,outlet_order_visible,image_url,default_warehouse_id,active"
      )
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

    const effectiveItemId = itemId ?? (existing as CatalogVariantRow).item_id;
    if (!effectiveItemId) return NextResponse.json({ error: "Parent product (item_id) is required" }, { status: 400 });
    if (itemId && itemId !== (existing as CatalogVariantRow).item_id) {
      return NextResponse.json({ error: "item_id does not match existing variant" }, { status: 400 });
    }

    const { data: itemRow, error: itemError } = (await supabase
      .from("catalog_items")
      .select("id,item_kind")
      .eq("id", effectiveItemId)
      .maybeSingle()) as { data: { id: string; item_kind?: ItemKind | null } | null; error: Error | null };
    if (itemError) throw itemError;
    if (!itemRow) return NextResponse.json({ error: "Parent product not found" }, { status: 404 });

    const update: Partial<VariantPayload> = {};

    if (body.name !== undefined) {
      const name = cleanText(body.name);
      if (!name) return NextResponse.json({ error: "Variant name is required" }, { status: 400 });
      update.name = name;
    }

    if (body.sku !== undefined) update.sku = cleanText(body.sku) ?? null;
    if (body.supplier_sku !== undefined) update.supplier_sku = cleanText(body.supplier_sku) ?? null;
    if (body.item_kind !== undefined) {
      update.item_kind = cleanItemKind(body.item_kind, (existing as CatalogVariantRow).item_kind ?? itemRow?.item_kind ?? "finished");
    }
    if (body.consumption_uom !== undefined) {
      update.consumption_uom = cleanText(body.consumption_uom) ?? "each";
    }
    if (body.stocktake_uom !== undefined) update.stocktake_uom = cleanText(body.stocktake_uom) ?? null;
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
      update.purchase_unit_mass_uom = cleanText(body.purchase_unit_mass_uom) ?? null;
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
    if (body.outlet_order_visible !== undefined) {
      update.outlet_order_visible = cleanBoolean(body.outlet_order_visible, true);
    }
    if (body.image_url !== undefined) update.image_url = cleanText(body.image_url) ?? null;
    if (body.default_warehouse_id !== undefined) {
      update.default_warehouse_id = cleanUuid(body.default_warehouse_id);
    }
    if (body.active !== undefined) update.active = cleanBoolean(body.active, true);

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No update fields provided" }, { status: 400 });
    }

    let updatePayload: Partial<VariantPayload> = { ...update };
    let optionalKeys = VARIANT_OPTIONAL_FIELDS.filter((key) => key in updatePayload);
    let updateError: any = null;

    while (true) {
      const result = await supabase
        .from("catalog_variants")
        .update(updatePayload)
        .eq("id", id)
        .eq("item_id", effectiveItemId);
      updateError = result.error;

      if (updateError?.code === "42703" && optionalKeys.length) {
        const removeKey = optionalKeys.pop();
        if (removeKey) {
          const { [removeKey]: _removed, ...rest } = updatePayload as Record<string, unknown>;
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

    if (update.default_warehouse_id !== undefined) {
      try {
        const nextStorageHomeId = update.default_warehouse_id ?? null;
        await upsertVariantStorageHome(supabase, effectiveItemId, responseVariant.id, nextStorageHomeId);
      } catch (storageError) {
        console.error("[catalog/variants] storage home upsert failed", storageError);
      }
    }

    return NextResponse.json({ variant: { ...responseVariant, storage_home_id: responseVariant.default_warehouse_id ?? null } });
  } catch (error) {
    const details = toErrorDetails(error);
    console.error("[catalog/variants] PUT failed", details);
    return NextResponse.json({ error: "Unable to update variant", details }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
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
      .select("id")
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

    return NextResponse.json({ id, item_id: itemId });
  } catch (error) {
    console.error("[catalog/variants] DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete variant" }, { status: 500 });
  }
}
