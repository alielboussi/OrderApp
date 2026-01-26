import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

const buildEnricher = (supabase: ReturnType<typeof getServiceClient>) => {
  return async (rows: any[]) => {
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
};

export async function GET() {
  try {
    const supabase = getServiceClient();
    const enrichWithCatalog = buildEnricher(supabase);

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
    const err = error as { code?: string; message?: unknown };
    // If the new columns aren't in the DB yet, fall back to legacy columns so the page still works.
    if (err?.code === "42703" || (typeof err?.message === "string" && err.message.includes("pos_item_name"))) {
      try {
        const supabase = getServiceClient();
        const enrichWithCatalogLegacy = buildEnricher(supabase);
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
          enriched = await enrichWithCatalogLegacy(mapped);
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
    if (pos_item_id === catalog_item_id) {
      return NextResponse.json({ error: "pos_item_id cannot be the same as catalog_item_id" }, { status: 400 });
    }

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

    const enrichWithCatalog = buildEnricher(supabase);

    const findExisting = async (selectCols: string) => {
      let query = supabase
        .from("pos_item_map")
        .select(selectCols)
        .eq("pos_item_id", pos_item_id)
        .eq("catalog_item_id", catalog_item_id)
        .eq("catalog_variant_key", catalog_variant_key)
        .eq("outlet_id", outlet_id);

      if (pos_flavour_id) query = query.eq("pos_flavour_id", pos_flavour_id);
      else query = query.is("pos_flavour_id", null);

      if (warehouse_id) query = query.eq("warehouse_id", warehouse_id);
      else query = query.is("warehouse_id", null);

      const { data, error } = await query.limit(1);
      if (error) throw error;
      return Array.isArray(data) && data.length ? data[0] : null;
    };

    const insertAndSelect = async (payload: Record<string, any>, selectCols: string) => {
      const { data, error } = await supabase.from("pos_item_map").insert(payload).select(selectCols).single();
      if (error) {
        const err = error as { code?: string };
        if (err?.code === "23505") {
          const existing = await findExisting(selectCols);
          if (existing) return existing;
        }
        throw error;
      }

      const row = data as any;
      let catalogName: string | null = null;
      let catalogVariantLabel: string | null = null;
      if (row?.catalog_item_id) {
        const { data: catalogItem, error: catalogError } = await supabase
          .from("catalog_items")
          .select("id,name,variants")
          .eq("id", row.catalog_item_id)
          .single();
        if (!catalogError && catalogItem) {
          catalogName = (catalogItem as any).name ?? null;
          const variants = Array.isArray((catalogItem as any).variants) ? (catalogItem as any).variants : [];
          const variantKey = row.catalog_variant_key || row.normalized_variant_key || "base";
          const match = variants.find(
            (v: any) => v?.key === variantKey || v?.id === variantKey || v?.name === variantKey || v?.label === variantKey
          );
          catalogVariantLabel = match ? match.name || match.label || match.title || match.key || variantKey : null;
        }
      }

      return {
        ...row,
        catalog_item_name: catalogName,
        catalog_variant_label: catalogVariantLabel,
        pos_item_name: row.pos_item_name ?? catalogName ?? row.pos_item_id ?? null,
        pos_flavour_name: row.pos_flavour_name ?? row.pos_flavour_id ?? null,
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
      const existing = await findExisting(fullSelect);
      if (existing) {
        const [enriched] = await enrichWithCatalog([existing]);
        return NextResponse.json({ mapping: enriched ?? existing, duplicate: true }, { status: 200 });
      }
      const data = await insertAndSelect(basePayload, fullSelect);
      return NextResponse.json({ mapping: data }, { status: 201 });
    } catch (error: any) {
      const err = error as { code?: string; message?: unknown };
      if (err?.code === "42703" || (typeof err?.message === "string" && err.message.includes("pos_item_name"))) {
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

        const existingLegacy = await findExisting(legacySelect);
        if (existingLegacy) {
          const [enrichedLegacy] = await enrichWithCatalog([existingLegacy]);
          return NextResponse.json({ mapping: enrichedLegacy ?? existingLegacy, duplicate: true }, { status: 200 });
        }

        const data = await insertAndSelect(legacyPayload, legacySelect);
        return NextResponse.json({ mapping: data }, { status: 201 });
      }
      throw error;
    }
  } catch (error) {
    console.error("[pos-item-map] POST failed", error);
    const message = error instanceof Error ? error.message : "Unable to create mapping";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pos_item_id = searchParams.get("pos_item_id");
    const catalog_item_id = searchParams.get("catalog_item_id");
    const outlet_id = searchParams.get("outlet_id");
    const pos_flavour_id = searchParams.get("pos_flavour_id");
    const catalog_variant_key = searchParams.get("catalog_variant_key");
    const warehouse_id = searchParams.get("warehouse_id");

    if (!pos_item_id || !catalog_item_id || !outlet_id) {
      return NextResponse.json({ error: "pos_item_id, catalog_item_id, and outlet_id are required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const match: Record<string, any> = {
      pos_item_id,
      catalog_item_id,
      outlet_id,
    };
    if (pos_flavour_id) match.pos_flavour_id = pos_flavour_id;
    if (catalog_variant_key) match.catalog_variant_key = catalog_variant_key;
    if (warehouse_id) match.warehouse_id = warehouse_id;

    const { error } = await supabase.from("pos_item_map").delete().match(match);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[pos-item-map] DELETE failed", error);
    return NextResponse.json({ error: "Unable to delete mapping" }, { status: 500 });
  }
}
