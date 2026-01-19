import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

const QTY_UNITS = ["each", "g", "kg", "mg", "ml", "l"] as const;
type QtyUnit = (typeof QTY_UNITS)[number];

type VariantPayload = {
  item_id: string;
  name: string;
  sku?: string | null;
  consumption_uom: string;
  purchase_pack_unit: string;
  units_per_purchase_pack: number;
  purchase_unit_mass?: number | null;
  purchase_unit_mass_uom?: QtyUnit | null;
  transfer_unit: string;
  transfer_quantity: number;
  cost: number;
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
  return typeof value === "string" && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());
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

type VariantRecord = VariantPayload & { key?: string; id?: string };

type CatalogItemRow = {
  id: string;
  name?: string | null;
  variants?: VariantRecord[] | null;
  active?: boolean | null;
};

const asVariantArray = (value: unknown): VariantRecord[] => (Array.isArray(value) ? (value as VariantRecord[]) : []);

function toVariantResponse(itemId: string, variant: VariantRecord) {
  const key = (variant.key ?? variant.id ?? "").toString().trim();
  if (!key) return null;
  return {
    id: key,
    item_id: itemId,
    name: variant.name ?? "Variant",
    sku: variant.sku ?? null,
    consumption_uom: variant.consumption_uom ?? "each",
    purchase_pack_unit: variant.purchase_pack_unit ?? "each",
    units_per_purchase_pack: variant.units_per_purchase_pack ?? 1,
    purchase_unit_mass: variant.purchase_unit_mass ?? null,
    purchase_unit_mass_uom: variant.purchase_unit_mass_uom ?? null,
    transfer_unit: variant.transfer_unit ?? variant.purchase_pack_unit ?? "each",
    transfer_quantity: variant.transfer_quantity ?? 1,
    cost: variant.cost ?? 0,
    locked_from_warehouse_id: variant.locked_from_warehouse_id ?? null,
    outlet_order_visible: variant.outlet_order_visible ?? true,
    image_url: variant.image_url ?? null,
    default_warehouse_id: variant.default_warehouse_id ?? null,
    active: variant.active ?? true,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const itemId = url.searchParams.get("item_id")?.trim() || undefined;
    const id = url.searchParams.get("id")?.trim() || undefined;
    const search = url.searchParams.get("q")?.trim().toLowerCase() || "";
    const supabase = getServiceClient();
    let query = supabase.from("catalog_items").select("id,name,variants,active");
    if (itemId) query = query.eq("id", itemId);
    query = query.eq("active", true);

    const { data, error } = (await query) as { data: CatalogItemRow[] | null; error: Error | null };
    if (error) throw error;

    const { data: recipeRows, error: recipeError } = await supabase
      .from("recipes")
      .select("finished_item_id, finished_variant_key")
      .eq("active", true);
    if (recipeError) throw recipeError;
    const normalizeVariant = (key: string | null | undefined) => (key && key.trim() ? key.trim() : "base");
    const recipeCountByVariant: Record<string, number> = {};
    (recipeRows as RecipeRow[] | null)?.forEach((row) => {
      if (!row.finished_item_id) return;
      const comboKey = `${row.finished_item_id}::${normalizeVariant(row.finished_variant_key)}`;
      recipeCountByVariant[comboKey] = (recipeCountByVariant[comboKey] || 0) + 1;
    });

    const variants = (data ?? []).flatMap((item) => {
      const entries = asVariantArray(item.variants);
      return entries
        .map((variant) => {
          const normalizedKey = normalizeVariant((variant as any).key ?? (variant as any).id ?? null);
          const hasRecipe = recipeCountByVariant[`${item.id}::${normalizedKey}`] > 0;
          const response = toVariantResponse(item.id, variant);
          if (!response) return null;
          return {
            ...response,
            has_recipe: hasRecipe,
          };
        })
        .filter((v): v is NonNullable<ReturnType<typeof toVariantResponse>> & { has_recipe: boolean } => Boolean(v));
    });

    if (id) {
      const found = variants.find((variant) => variant.id === id);
      if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ variant: found });
    }

    const filtered = search
      ? variants.filter((variant) => {
          const name = variant.name?.toLowerCase?.() ?? "";
          const sku = variant.sku?.toLowerCase?.() ?? "";
          return name.includes(search) || sku.includes(search);
        })
      : variants;

    return NextResponse.json({ variants: filtered });
  } catch (error) {
    console.error("[catalog/variants] GET failed", error);
    return NextResponse.json({ error: "Unable to load variants" }, { status: 500 });
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

    let purchaseUnitMass: number | null = null;
    if (body.purchase_unit_mass !== undefined && body.purchase_unit_mass !== null && `${body.purchase_unit_mass}`.trim() !== "") {
      const mass = toNumber(body.purchase_unit_mass, 0, 0);
      if (!mass.ok) return NextResponse.json({ error: mass.error }, { status: 400 });
      purchaseUnitMass = mass.value;
    }

    const payload: VariantPayload = {
      item_id: itemId,
      name,
      sku: cleanText(body.sku) ?? null,
      consumption_uom: consumptionUom,
      purchase_pack_unit: purchasePackUnit,
      units_per_purchase_pack: unitsPerPack.value,
      purchase_unit_mass: purchaseUnitMass,
      purchase_unit_mass_uom: purchaseUnitMass ? pickQtyUnit(body.purchase_unit_mass_uom, "kg") : null,
      transfer_unit: transferUnit,
      transfer_quantity: transferQuantity.value,
      cost: cost.value,
      locked_from_warehouse_id: cleanUuid(body.locked_from_warehouse_id),
      outlet_order_visible: cleanBoolean(body.outlet_order_visible, true),
      image_url: cleanText(body.image_url) ?? null,
      default_warehouse_id: cleanUuid(body.default_warehouse_id),
      active: cleanBoolean(body.active, true),
    };

    const supabase = getServiceClient();
    const { data: itemRow, error: itemError } = (await supabase
      .from("catalog_items")
      .select("variants")
      .eq("id", itemId)
      .maybeSingle()) as { data: CatalogItemRow | null; error: Error | null };
    if (itemError) throw itemError;
    if (!itemRow) return NextResponse.json({ error: "Parent product not found" }, { status: 404 });

    const existing = asVariantArray(itemRow.variants);
    const newVariant: VariantRecord = { ...payload, key: randomUUID() };
    const nextVariants = [...existing, newVariant];

    const { error: updateError } = await supabase
      .from("catalog_items")
      .update({ variants: nextVariants, has_variations: true })
      .eq("id", itemId);
    if (updateError) throw updateError;

    const responseVariant = toVariantResponse(itemId, newVariant);
    if (!responseVariant) return NextResponse.json({ error: "Failed to save variant" }, { status: 500 });

    return NextResponse.json({ variant: responseVariant });
  } catch (error) {
    console.error("[catalog/variants] POST failed", error);
    return NextResponse.json({ error: "Unable to create variant" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = cleanText(body.id);
    if (!id || !isUuid(id)) return NextResponse.json({ error: "id is required for update" }, { status: 400 });

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

    let purchaseUnitMass: number | null = null;
    if (body.purchase_unit_mass !== undefined && body.purchase_unit_mass !== null && `${body.purchase_unit_mass}`.trim() !== "") {
      const mass = toNumber(body.purchase_unit_mass, 0, 0);
      if (!mass.ok) return NextResponse.json({ error: mass.error }, { status: 400 });
      purchaseUnitMass = mass.value;
    }

    const payload: VariantPayload = {
      item_id: itemId,
      name,
      sku: cleanText(body.sku) ?? null,
      consumption_uom: consumptionUom,
      purchase_pack_unit: purchasePackUnit,
      units_per_purchase_pack: unitsPerPack.value,
      purchase_unit_mass: purchaseUnitMass,
      purchase_unit_mass_uom: purchaseUnitMass ? pickQtyUnit(body.purchase_unit_mass_uom, "kg") : null,
      transfer_unit: transferUnit,
      transfer_quantity: transferQuantity.value,
      cost: cost.value,
      outlet_order_visible: cleanBoolean(body.outlet_order_visible, true),
      image_url: cleanText(body.image_url) ?? null,
      default_warehouse_id: cleanUuid(body.default_warehouse_id),
      active: cleanBoolean(body.active, true),
    };

    const supabase = getServiceClient();
    const { data: itemRow, error: itemError } = (await supabase
      .from("catalog_items")
      .select("variants")
      .eq("id", itemId)
      .maybeSingle()) as { data: CatalogItemRow | null; error: Error | null };
    if (itemError) throw itemError;
    if (!itemRow) return NextResponse.json({ error: "Parent product not found" }, { status: 404 });

    const existing = asVariantArray(itemRow.variants);
    const updated = existing.map((variant) => {
      const key = (variant?.key ?? variant?.id ?? "").toString().trim();
      if (key && key === id) {
        return { ...variant, ...payload, key } as VariantRecord;
      }
      return variant;
    });

    const found = updated.find((variant) => (variant?.key ?? variant?.id ?? "").toString() === id) ?? null;
    if (!found) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

    const { error: updateError } = await supabase
      .from("catalog_items")
      .update({ variants: updated, has_variations: true })
      .eq("id", itemId);
    if (updateError) throw updateError;

    const responseVariant = toVariantResponse(itemId, found);
    if (!responseVariant) return NextResponse.json({ error: "Failed to update variant" }, { status: 500 });

    return NextResponse.json({ variant: responseVariant });
  } catch (error) {
    console.error("[catalog/variants] PUT failed", error);
    return NextResponse.json({ error: "Unable to update variant" }, { status: 500 });
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

    if (!id || !isUuid(id)) return NextResponse.json({ error: "Valid variant id is required" }, { status: 400 });
    if (!itemId || !isUuid(itemId)) return NextResponse.json({ error: "Valid parent item_id is required" }, { status: 400 });

    const supabase = getServiceClient();
    const { data: itemRow, error: itemError } = (await supabase
      .from("catalog_items")
      .select("variants,has_variations")
      .eq("id", itemId)
      .maybeSingle()) as { data: CatalogItemRow | null; error: Error | null };

    if (itemError) throw itemError;
    if (!itemRow) return NextResponse.json({ error: "Parent product not found" }, { status: 404 });

    const existing = asVariantArray(itemRow.variants);
    const filtered = existing.filter((variant) => {
      const key = (variant?.key ?? variant?.id ?? "").toString().trim();
      return !key || key !== id;
    });

    if (filtered.length === existing.length) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

    const { error: updateError } = await supabase
      .from("catalog_items")
      .update({ variants: filtered, has_variations: filtered.length > 0 })
      .eq("id", itemId);
    if (updateError) throw updateError;

    return NextResponse.json({ id, item_id: itemId });
  } catch (error) {
    console.error("[catalog/variants] DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete variant" }, { status: 500 });
  }
}
