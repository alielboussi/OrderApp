export type AllowlistEntry = {
  id?: string;
  item_id: string;
  variant_id: string | null;
  allow_orders: boolean;
  item_name?: string;
  variant_name?: string | null;
  sku?: string | null;
  has_variations?: boolean;
};

export type OutletAuthAssignment = {
  outlet_id: string;
  auth_user_id: string;
  assignment_role: "orders" | "stocktake" | "both";
  active: boolean;
};

export type CatalogAccessVariant = {
  id: string;
  item_id: string;
  name: string;
  sku?: string | null;
  image_url?: string | null;
  allow_orders: boolean;
};

export type CatalogAccessItem = {
  id: string;
  name: string;
  sku?: string | null;
  item_kind?: string;
  has_variations?: boolean;
  image_url?: string | null;
  allow_orders: boolean;
  variants: CatalogAccessVariant[];
};

export function normalizeCatalogAccessItems(items: CatalogAccessItem[]): CatalogAccessItem[] {
  const enriched = items.map((item) => {
    const hasVariations = item.has_variations === true || item.variants.length > 0;
    const anyVariantSelected = item.variants.some((variant) => variant.allow_orders);
    return {
      ...item,
      has_variations: hasVariations,
      allow_orders: hasVariations ? anyVariantSelected : item.allow_orders,
    };
  });

  const groups = new Map<string, CatalogAccessItem[]>();
  for (const item of enriched) {
    const key = `${item.item_kind ?? "finished"}::${item.name.trim().toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const merged: CatalogAccessItem[] = [];
  for (const groupItems of groups.values()) {
    if (groupItems.length === 1) {
      merged.push(groupItems[0]);
      continue;
    }

    const variantItems = groupItems.filter((item) => item.variants.length > 0);
    if (variantItems.length > 0) {
      const primary = [...variantItems].sort((a, b) => b.variants.length - a.variants.length)[0];
      const variantsById = new Map<string, CatalogAccessVariant>();
      for (const item of variantItems) {
        for (const variant of item.variants) {
          variantsById.set(variant.id, variant);
        }
      }
      const variants = [...variantsById.values()].sort((a, b) => a.name.localeCompare(b.name));
      merged.push({
        ...primary,
        has_variations: true,
        allow_orders: variants.some((variant) => variant.allow_orders),
        variants,
      });
      continue;
    }

    merged.push(groupItems[0]);
  }

  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildCatalogAccessEntries(catalog: CatalogAccessItem[]) {
  const entries: Array<{
    item_id: string;
    variant_id?: string | null;
    allow_orders: boolean;
  }> = [];

  for (const item of catalog) {
    if (item.has_variations && item.variants.length > 0) {
      const selected = item.variants.filter((variant) => variant.allow_orders);
      if (item.allow_orders && selected.length === 0) {
        throw new Error(`Select at least one variant for "${item.name}".`);
      }
      for (const variant of selected) {
        entries.push({
          item_id: variant.item_id,
          variant_id: variant.id,
          allow_orders: true,
        });
      }
      continue;
    }

    if (item.allow_orders) {
      entries.push({
        item_id: item.id,
        variant_id: null,
        allow_orders: true,
      });
    }
  }

  return entries;
}
