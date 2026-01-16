import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = getServiceClient();
    const enrichWithCatalog = async (rows: any[]) => {
      if (!rows?.length) return [];

      const itemIds = Array.from(new Set((rows ?? []).map((r) => r.catalog_item_id).filter(Boolean)));
      let catalogById = new Map<string, { name?: string | null; variants?: any[] }>();

      if (itemIds.length) {
        const { data: catalogData, error: catalogError } = await supabase
          .from("catalog_items")
          .select("id,name,variants")
          .in("id", itemIds);
        if (catalogError) {
          console.error("[pos-item-map] catalog lookup failed", catalogError);
        } else {
          (catalogData ?? []).forEach((c: any) => {
            let variants: any[] = [];
            if (Array.isArray(c.variants)) variants = c.variants;
            else if (typeof c.variants === "string") {
              try {
                const parsed = JSON.parse(c.variants);
                variants = Array.isArray(parsed) ? parsed : [];
              } catch (parseErr) {
                console.error("[pos-item-map] variants parse failed", parseErr);
              }
            }
            catalogById.set(c.id, { name: c.name, variants });
          });
        }
      }

      const findVariantLabel = (variants: any[], key: string | null | undefined) => {
        if (!key || !variants?.length) return null;
        const match = variants.find(
          (v: any) => v?.key === key || v?.id === key || v?.name === key || v?.label === key || v?.title === key
        );
        if (!match) return null;
        return match.name || match.label || match.title || match.key || key;
      };

      return (rows ?? []).map((row: any) => {
        const catalog = catalogById.get(row.catalog_item_id);
        const variantKey = row.catalog_variant_key || row.normalized_variant_key || "base";
        const variantLabel = findVariantLabel(catalog?.variants ?? [], variantKey);

        return {
          ...row,
          catalog_item_name: catalog?.name ?? null,
          catalog_variant_label: variantLabel ?? null,
          pos_item_name: row.pos_item_name ?? catalog?.name ?? row.pos_item_id ?? null,
          pos_flavour_name: row.pos_flavour_name ?? row.pos_flavour_id ?? null,
        };
      });
    };

    const mapWithFallback = (rows: any[]) =>
      rows.map((row) => ({
        ...row,
        pos_item_name: row.pos_item_name ?? row.pos_item_id ?? null,
        pos_flavour_name: row.pos_flavour_name ?? row.pos_flavour_id ?? null,
      }));
    const selectCols = [
      "pos_item_id",
      "pos_item_name",
      "pos_flavour_id",
      "pos_flavour_name",
      "catalog_item_id",
      "catalog_variant_key",
      "normalized_variant_key",
      "warehouse_id",
      "outlet_id",
    ].join(",");

    const attempt = async (columns: string) => {
      const { data, error } = await supabase.from("pos_item_map").select(columns);
      if (error) throw error;
      return mapWithFallback(data ?? []);
    };

    const baseRows = await attempt(selectCols);

    let mappings = baseRows;
    try {
      mappings = await enrichWithCatalog(baseRows);
    } catch (enrichError) {
      console.error("[pos-item-map] catalog enrich failed", enrichError);
      // fall back to base rows
      mappings = baseRows;
    }
    return NextResponse.json({ mappings });
  } catch (error) {
    // If the new columns aren't in the DB yet, fall back to legacy columns so the page still works.
    if (error?.code === "42703" || (typeof error?.message === "string" && error.message.includes("pos_item_name"))) {
      try {
        const supabase = getServiceClient();
        const legacyCols = [
          "pos_item_id",
          "pos_flavour_id",
          "catalog_item_id",
          "catalog_variant_key",
          "normalized_variant_key",
          "warehouse_id",
          "outlet_id",
        ].join(",");
        const { data, error: legacyError } = await supabase.from("pos_item_map").select(legacyCols);
        if (legacyError) throw legacyError;
        const rows = data ?? [];
        const mapped = rows.map((row: any) => ({
          ...row,
          pos_item_name: row.pos_item_id ?? null,
          pos_flavour_name: row.pos_flavour_id ?? null,
        }));
        let enriched = mapped;
        try {
          enriched = await enrichWithCatalog(mapped);
        } catch (enrichError) {
          console.error("[pos-item-map] catalog enrich failed (legacy)", enrichError);
          enriched = mapped;
        }
        return NextResponse.json({ mappings: enriched });
      } catch (err) {
        console.error("[pos-item-map] GET legacy fallback failed", err);
        return NextResponse.json({ error: "Unable to load POS item mappings" }, { status: 500 });
      }
    }

    console.error("[pos-item-map] GET failed", error);
    return NextResponse.json({ error: "Unable to load POS item mappings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const pos_item_id = typeof body.pos_item_id === "string" && body.pos_item_id.trim() ? body.pos_item_id.trim() : null;
    const pos_item_name = typeof body.pos_item_name === "string" && body.pos_item_name.trim() ? body.pos_item_name.trim() : null;
    const pos_flavour_id = typeof body.pos_flavour_id === "string" && body.pos_flavour_id.trim() ? body.pos_flavour_id.trim() : null;
    const pos_flavour_name =
      typeof body.pos_flavour_name === "string" && body.pos_flavour_name.trim() ? body.pos_flavour_name.trim() : null;
    const catalog_item_id = typeof body.catalog_item_id === "string" && body.catalog_item_id.trim() ? body.catalog_item_id.trim() : null;
    const catalog_variant_key = typeof body.catalog_variant_key === "string" && body.catalog_variant_key.trim()
      ? body.catalog_variant_key.trim()
      : "base";
    const warehouse_id = typeof body.warehouse_id === "string" && body.warehouse_id.trim() ? body.warehouse_id.trim() : null;
    const outlet_id = typeof body.outlet_id === "string" && body.outlet_id.trim() ? body.outlet_id.trim() : null;

    if (!pos_item_id) return NextResponse.json({ error: "pos_item_id is required" }, { status: 400 });
    if (!catalog_item_id) return NextResponse.json({ error: "catalog_item_id is required" }, { status: 400 });
    if (!outlet_id) return NextResponse.json({ error: "outlet_id is required" }, { status: 400 });

    const supabase = getServiceClient();
    const basePayload: Record<string, any> = {
      pos_item_id,
      pos_flavour_id,
      catalog_item_id,
      catalog_variant_key,
      normalized_variant_key: catalog_variant_key || "base",
      warehouse_id,
      outlet_id,
    };
    if (pos_item_name) basePayload.pos_item_name = pos_item_name;
    if (pos_flavour_name) basePayload.pos_flavour_name = pos_flavour_name;

    const insertAndSelect = async (payload: Record<string, any>, selectCols: string) => {
      const { data, error } = await supabase.from("pos_item_map").insert(payload).select(selectCols).single();
      if (error) throw error;

      let catalogName: string | null = null;
      let catalogVariantLabel: string | null = null;
      if (data?.catalog_item_id) {
        const { data: catalogItem, error: catalogError } = await supabase
          .from("catalog_items")
          .select("id,name,variants")
          .eq("id", data.catalog_item_id)
          .single();
        if (!catalogError && catalogItem) {
          catalogName = catalogItem.name ?? null;
          const variants = Array.isArray(catalogItem.variants) ? catalogItem.variants : [];
          const variantKey = data.catalog_variant_key || data.normalized_variant_key || "base";
          const match = variants.find(
            (v: any) => v?.key === variantKey || v?.id === variantKey || v?.name === variantKey || v?.label === variantKey
          );
          catalogVariantLabel = match ? match.name || match.label || match.title || match.key || variantKey : null;
        }
      }

      return {
        ...data,
        catalog_item_name: catalogName,
        catalog_variant_label: catalogVariantLabel,
        pos_item_name: data.pos_item_name ?? catalogName ?? data.pos_item_id ?? null,
        pos_flavour_name: data.pos_flavour_name ?? data.pos_flavour_id ?? null,
      };
    };

    const fullSelect = [
      "pos_item_id",
      "pos_item_name",
      "pos_flavour_id",
      "pos_flavour_name",
      "catalog_item_id",
      "catalog_variant_key",
      "normalized_variant_key",
      "warehouse_id",
      "outlet_id",
    ].join(",");

    try {
      const data = await insertAndSelect(basePayload, fullSelect);
      return NextResponse.json({ mapping: data }, { status: 201 });
    } catch (error: any) {
      if (error?.code === "42703" || (typeof error?.message === "string" && error.message.includes("pos_item_name"))) {
        // DB does not have the name columns yet; retry without them.
        const legacyPayload = { ...basePayload };
        delete legacyPayload.pos_item_name;
        delete legacyPayload.pos_flavour_name;

        const legacySelect = [
          "pos_item_id",
          "pos_flavour_id",
          "catalog_item_id",
          "catalog_variant_key",
          "normalized_variant_key",
          "warehouse_id",
          "outlet_id",
        ].join(",");

        const data = await insertAndSelect(legacyPayload, legacySelect);
        return NextResponse.json({ mapping: data }, { status: 201 });
      }
      throw error;
    }
  } catch (error) {
    console.error("[pos-item-map] POST failed", error);
    return NextResponse.json({ error: "Unable to create mapping" }, { status: 500 });
  }
}
