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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const itemId = url.searchParams.get("item_id")?.trim() || undefined;
    const id = url.searchParams.get("id")?.trim() || undefined;
    const search = url.searchParams.get("q")?.trim().toLowerCase() || "";
    const supabase = getServiceClient();

    if (id) {
      const { data, error } = await supabase
        .from("catalog_variants")
        .select("id,name,sku,item_id,consumption_uom,purchase_pack_unit,units_per_purchase_pack,purchase_unit_mass,purchase_unit_mass_uom,transfer_unit,transfer_quantity,cost,locked_from_warehouse_id,outlet_order_visible,image_url,default_warehouse_id,active")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ variant: data });
    }

    let query = supabase
      .from("catalog_variants")
      .select("id,name,sku,item_id,consumption_uom,purchase_pack_unit,units_per_purchase_pack,purchase_unit_mass,purchase_unit_mass_uom,transfer_unit,transfer_quantity,cost,locked_from_warehouse_id,outlet_order_visible,image_url,default_warehouse_id,active")
      .order("name");

    if (itemId) query = query.eq("item_id", itemId);
    if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ variants: Array.isArray(data) ? data : [] });
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
    const { data, error } = await supabase
      .from("catalog_variants")
      .insert([payload])
      .select("id,name,sku,item_id")
      .single();

    if (error) throw error;

    await supabase.from("catalog_items").update({ has_variations: true }).eq("id", itemId);

    return NextResponse.json({ variant: data });
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
      locked_from_warehouse_id: cleanUuid(body.locked_from_warehouse_id),
      outlet_order_visible: cleanBoolean(body.outlet_order_visible, true),
      image_url: cleanText(body.image_url) ?? null,
      default_warehouse_id: cleanUuid(body.default_warehouse_id),
      active: cleanBoolean(body.active, true),
    };

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("catalog_variants")
      .update(payload)
      .eq("id", id)
      .select("id,name,sku,item_id")
      .single();

    if (error) throw error;

    await supabase.from("catalog_items").update({ has_variations: true }).eq("id", itemId);

    return NextResponse.json({ variant: data });
  } catch (error) {
    console.error("[catalog/variants] PUT failed", error);
    return NextResponse.json({ error: "Unable to update variant" }, { status: 500 });
  }
}
