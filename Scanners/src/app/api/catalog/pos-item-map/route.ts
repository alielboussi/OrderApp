import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

type PosMapRow = {
  pos_item_id?: string | null;
  pos_item_name?: string | null;
  pos_flavour_id?: string | null;
  pos_flavour_name?: string | null;
  catalog_item_id?: string | null;
  catalog_variant_key?: string | null;
  normalized_variant_key?: string | null;
  warehouse_id?: string | null;
  outlet_id?: string | null;
};

type CatalogItemRow = { id: string; name?: string | null };
type CatalogVariantRow = { id: string; item_id: string; name?: string | null };

const buildEnricher = (supabase: ReturnType<typeof getServiceClient>) => {
  return async (rows: PosMapRow[]) => {
      if (!rows?.length) return [];

      const normalizeVariantKey = (value?: string | null) => {
        const trimmed = value?.trim();
        return trimmed && trimmed.length ? trimmed : "base";
      };

      const itemIds = Array.from(new Set((rows ?? []).map((r) => r.catalog_item_id).filter(Boolean)));
      const catalogById = new Map<string, { name?: string | null; variants?: Map<string, string> }>();

      if (itemIds.length) {
        const [{ data: catalogData, error: catalogError }, { data: variantData, error: variantError }] = await Promise.all([
          supabase.from("catalog_items").select("id,name").in("id", itemIds),
          supabase.from("catalog_variants").select("id,item_id,name").in("item_id", itemIds),
        ]);

        if (catalogError) {
          console.error("[pos-item-map] catalog lookup failed", catalogError);
        }
        if (variantError) {
          console.error("[pos-item-map] variant lookup failed", variantError);
        }

        const variantLabelByItem = new Map<string, Map<string, string>>();
        (variantData as CatalogVariantRow[] | null ?? []).forEach((variant) => {
          if (!variant?.item_id || !variant?.id) return;
          const itemKey = variant.item_id;
          const label = variant.name || variant.id;
          const map = variantLabelByItem.get(itemKey) ?? new Map<string, string>();
          map.set(variant.id, label);
          map.set(normalizeVariantKey(variant.id), label);
          variantLabelByItem.set(itemKey, map);
        });

        (catalogData as CatalogItemRow[] | null ?? []).forEach((c) => {
          catalogById.set(c.id, { name: c.name, variants: variantLabelByItem.get(c.id) ?? new Map() });
        });
      }

      const findVariantLabel = (variants: Map<string, string> | undefined, key: string | null | undefined) => {
        if (!key || !variants) return null;
        const trimmed = key.trim();
        return variants.get(trimmed) ?? variants.get(normalizeVariantKey(trimmed)) ?? null;
      };

      return (rows ?? []).map((row) => {
        const catalog = catalogById.get(row.catalog_item_id);
        const variantKey = row.catalog_variant_key || row.normalized_variant_key || "base";
        const variantLabel = findVariantLabel(catalog?.variants, variantKey);

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

    const mapWithFallback = (rows: PosMapRow[]) =>
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
        const mapped = (rows as PosMapRow[]).map((row) => ({
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
    const basePayload: Record<string, string | null> = {
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

    const insertAndSelect = async (payload: Record<string, string | null>, selectCols: string) => {
      const { data, error } = await supabase.from("pos_item_map").insert(payload).select(selectCols).single();
      if (error) {
        const err = error as { code?: string };
        if (err?.code === "23505") {
          const existing = await findExisting(selectCols);
          if (existing) return existing;
        }
        throw error;
      }

      const row = data as PosMapRow;
      let catalogName: string | null = null;
      let catalogVariantLabel: string | null = null;
      if (row?.catalog_item_id) {
        const [{ data: catalogItem, error: catalogError }, { data: variantRow, error: variantError }] = await Promise.all([
          supabase.from("catalog_items").select("id,name").eq("id", row.catalog_item_id).single(),
          supabase
            .from("catalog_variants")
            .select("id,name")
            .eq("item_id", row.catalog_item_id)
            .eq("id", row.catalog_variant_key || row.normalized_variant_key || "base")
            .maybeSingle(),
        ]);
        if (!catalogError && catalogItem) {
          catalogName = (catalogItem as CatalogItemRow).name ?? null;
        }
        if (!variantError && variantRow) {
          const variantTyped = variantRow as CatalogVariantRow;
          catalogVariantLabel = variantTyped.name ?? variantTyped.id ?? null;
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
    } catch (error) {
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
    const match: Record<string, string | null> = {
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
