import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

const ITEM_KINDS = ["finished", "ingredient", "raw"] as const;
const QTY_UNITS = ["each", "g", "kg", "mg", "ml", "l"] as const;

type ItemKind = (typeof ITEM_KINDS)[number];
type QtyUnit = (typeof QTY_UNITS)[number];

type ItemPayload = {
  name: string;
  sku?: string | null;
  item_kind: ItemKind;
  base_unit: QtyUnit;
  consumption_uom: string;
  purchase_pack_unit: string;
  units_per_purchase_pack: number;
  purchase_unit_mass?: number | null;
  purchase_unit_mass_uom?: QtyUnit | null;
  transfer_unit: string;
  transfer_quantity: number;
  cost: number;
  has_variations: boolean;
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

function pickItemKind(value: unknown): CleanResult<ItemKind> {
  if (typeof value === "string" && ITEM_KINDS.includes(value as ItemKind)) {
    return { ok: true, value: value as ItemKind };
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() || null;
    const search = url.searchParams.get("q")?.trim().toLowerCase() || "";
    const supabase = getServiceClient();
    const baseSelect = supabase
      .from("catalog_items")
      .select("id,name,sku,item_kind,has_variations,active,consumption_uom,purchase_pack_unit,units_per_purchase_pack,purchase_unit_mass,purchase_unit_mass_uom,transfer_unit,transfer_quantity,cost,locked_from_warehouse_id,outlet_order_visible,image_url,default_warehouse_id,base_unit,active");

    if (id) {
      const { data, error } = await baseSelect.eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ item: data });
    }

    let listQuery = baseSelect.order("name");
    if (search) listQuery = listQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);

    const { data, error } = await listQuery;
    if (error) throw error;
    return NextResponse.json({ items: Array.isArray(data) ? data : [] });
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

    const baseUnit = pickQtyUnit(body.base_unit, "each");
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

    const payload: ItemPayload = {
      name,
      sku: cleanText(body.sku) ?? null,
      item_kind: itemKind.value,
      base_unit: baseUnit,
      consumption_uom: consumptionUom,
      purchase_pack_unit: purchasePackUnit,
      units_per_purchase_pack: unitsPerPack.value,
      purchase_unit_mass: purchaseUnitMass,
      purchase_unit_mass_uom: purchaseUnitMass ? pickQtyUnit(body.purchase_unit_mass_uom, "kg") : null,
      transfer_unit: transferUnit,
      transfer_quantity: transferQuantity.value,
      cost: cost.value,
      has_variations: cleanBoolean(body.has_variations, false),
      outlet_order_visible: cleanBoolean(body.outlet_order_visible, true),
      image_url: cleanText(body.image_url) ?? null,
      default_warehouse_id: cleanUuid(body.default_warehouse_id),
      active: cleanBoolean(body.active, true),
    };

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("catalog_items")
      .insert([payload])
      .select("id,name,sku,item_kind")
      .single();

    if (error) throw error;

    return NextResponse.json({ item: data });
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

    const baseUnit = pickQtyUnit(body.base_unit, "each");
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

    const payload: ItemPayload = {
      name,
      sku: cleanText(body.sku) ?? null,
      item_kind: itemKind.value,
      base_unit: baseUnit,
      consumption_uom: consumptionUom,
      purchase_pack_unit: purchasePackUnit,
      units_per_purchase_pack: unitsPerPack.value,
      purchase_unit_mass: purchaseUnitMass,
      purchase_unit_mass_uom: purchaseUnitMass ? pickQtyUnit(body.purchase_unit_mass_uom, "kg") : null,
      transfer_unit: transferUnit,
      transfer_quantity: transferQuantity.value,
      cost: cost.value,
      has_variations: cleanBoolean(body.has_variations, false),
      outlet_order_visible: cleanBoolean(body.outlet_order_visible, true),
      image_url: cleanText(body.image_url) ?? null,
      default_warehouse_id: cleanUuid(body.default_warehouse_id),
      active: cleanBoolean(body.active, true),
    };

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("catalog_items")
      .update(payload)
      .eq("id", id)
      .select("id,name,sku,item_kind")
      .single();

    if (error) throw error;

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error("[catalog/items] PUT failed", error);
    return NextResponse.json({ error: "Unable to update item" }, { status: 500 });
  }
}
