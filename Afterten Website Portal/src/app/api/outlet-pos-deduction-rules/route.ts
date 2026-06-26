import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type RuleRow = {
  id?: string;
  outlet_id: string;
  sold_item_id: string;
  sold_variant_key: string;
  deduct_item_id: string;
  deduct_variant_key: string;
  deduct_qty_per_sale: number;
  warehouse_id: string;
  active?: boolean;
  notes?: string | null;
};

const normalizeVariantKey = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized && normalized.length ? normalized : "base";
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[1-5][0-9a-fA-F-]{3}-[89abAB][0-9a-fA-F-]{3}-[0-9a-fA-F-]{12}$/.test(value.trim());

const cleanUuid = (value: unknown) => (isUuid(value) ? value.trim() : null);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const outletId = cleanUuid(url.searchParams.get("outlet_id"));
    const soldItemId = cleanUuid(url.searchParams.get("sold_item_id"));
    const soldVariantKey = normalizeVariantKey(url.searchParams.get("sold_variant_key"));

    const supabase = getServiceClient();
    let query = supabase
      .from("outlet_pos_deduction_rules")
      .select(
        "id,outlet_id,sold_item_id,sold_variant_key,deduct_item_id,deduct_variant_key,deduct_qty_per_sale,warehouse_id,active,notes,updated_at"
      )
      .eq("active", true)
      .order("updated_at", { ascending: false });

    if (outletId) query = query.eq("outlet_id", outletId);
    if (soldItemId) query = query.eq("sold_item_id", soldItemId);
    if (url.searchParams.has("sold_variant_key")) {
      query = query.eq("sold_variant_key", soldVariantKey);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ rules: data ?? [] });
  } catch (error) {
    console.error("[outlet-pos-deduction-rules] GET failed", error);
    return NextResponse.json({ error: "Unable to load POS deduction rules" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const outletId = cleanUuid(body.outlet_id);
    const soldItemId = cleanUuid(body.sold_item_id);
    const soldVariantKey = normalizeVariantKey(body.sold_variant_key);
    const rulesInput: unknown[] = Array.isArray(body.rules) ? body.rules : [];

    if (!outletId || !soldItemId) {
      return NextResponse.json({ error: "outlet_id and sold_item_id are required" }, { status: 400 });
    }

    const upserts: RuleRow[] = [];
    for (const entry of rulesInput) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const deductItemId = cleanUuid(row.deduct_item_id);
      const warehouseId = cleanUuid(row.warehouse_id);
      const qty = Number(row.deduct_qty_per_sale);
      if (!deductItemId || !warehouseId || !Number.isFinite(qty) || qty <= 0) continue;

      upserts.push({
        outlet_id: outletId,
        sold_item_id: soldItemId,
        sold_variant_key: soldVariantKey,
        deduct_item_id: deductItemId,
        deduct_variant_key: normalizeVariantKey(row.deduct_variant_key as string | null),
        deduct_qty_per_sale: qty,
        warehouse_id: warehouseId,
        active: true,
        notes: typeof row.notes === "string" ? row.notes : null,
      });
    }

    const supabase = getServiceClient();

    const { error: deleteError } = await supabase
      .from("outlet_pos_deduction_rules")
      .delete()
      .eq("outlet_id", outletId)
      .eq("sold_item_id", soldItemId)
      .eq("sold_variant_key", soldVariantKey);

    if (deleteError) throw deleteError;

    if (upserts.length) {
      const { error: upsertError } = await supabase.from("outlet_pos_deduction_rules").insert(upserts);
      if (upsertError) throw upsertError;
    }

    return NextResponse.json({ ok: true, saved: upserts.length });
  } catch (error) {
    console.error("[outlet-pos-deduction-rules] PUT failed", error);
    return NextResponse.json({ error: "Unable to save POS deduction rules" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = cleanUuid(url.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const supabase = getServiceClient();
    const { error } = await supabase.from("outlet_pos_deduction_rules").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[outlet-pos-deduction-rules] DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete rule" }, { status: 500 });
  }
}
