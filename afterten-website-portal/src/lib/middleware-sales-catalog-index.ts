import "server-only";

import type { Firestore } from "firebase-admin/firestore";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export type CatalogItemRow = {
  id: string;
  name: string | null;
  sku: string | null;
  menu_group_id: string | null;
};

export type CatalogVariantRow = {
  id: string;
  item_id: string;
  name: string | null;
  sku: string | null;
};

export type CatalogMenuGroupRow = {
  id: string;
  name: string | null;
  pos_menu_group_id: number | null;
};

export type PosItemMapRow = {
  outlet_id: string | null;
  pos_item_id: string | null;
  pos_flavour_id: string | null;
  catalog_item_id: string | null;
  catalog_variant_key: string | null;
};

export type MiddlewareSalesCatalogIndex = {
  itemById: Map<string, CatalogItemRow>;
  itemIdBySku: Map<string, string>;
  itemIdByNormalizedName: Map<string, string>;
  variantByItemAndKey: Map<string, CatalogVariantRow>;
  variantByItemAndName: Map<string, CatalogVariantRow>;
  menuGroupById: Map<string, CatalogMenuGroupRow>;
  posMapByOutletPosFlavour: Map<string, PosItemMapRow>;
};

export function isCatalogUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return UUID_RE.test(value.trim());
}

function normalizeKey(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length ? trimmed.toLowerCase() : "";
}

function normalizeName(value: string | null | undefined): string {
  return normalizeKey(value).replace(/\s+/g, " ");
}

function variantNameLookupKey(itemId: string, name: string): string {
  return `${itemId.toLowerCase()}::${normalizeName(name)}`;
}

function itemNameLookupKey(name: string): string {
  return normalizeName(name);
}

function normalizeVariantKey(value: string | null | undefined): string {
  const key = normalizeKey(value);
  return key && key !== "base" ? key : "base";
}

function variantLookupKey(itemId: string, variantIdOrSku: string): string {
  return `${itemId.toLowerCase()}::${variantIdOrSku.toLowerCase()}`;
}

function posMapLookupKey(outletId: string, posItemId: string, flavourId: string | null): string {
  return `${outletId.toLowerCase()}::${posItemId.toLowerCase()}::${normalizeKey(flavourId) || "none"}`;
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asNullableInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function assembleMiddlewareSalesCatalogIndex(
  items: CatalogItemRow[],
  variants: Array<{ id: string; item_id: string | null; name: string | null; sku: string | null; variant_key?: string | null }>,
  menuGroups: CatalogMenuGroupRow[],
  posMaps: PosItemMapRow[],
  outletIds: string[],
): MiddlewareSalesCatalogIndex {
  const itemById = new Map<string, CatalogItemRow>();
  const itemIdBySku = new Map<string, string>();
  const itemIdByNormalizedName = new Map<string, string>();

  for (const row of items) {
    itemById.set(row.id, row);
    if (row.sku) {
      const skuKey = row.sku.toLowerCase();
      const existing = itemIdBySku.get(skuKey);
      if (!existing || (!isCatalogUuid(existing) && isCatalogUuid(row.id))) {
        itemIdBySku.set(skuKey, row.id);
      }
    }
    if (!isCatalogUuid(row.id)) {
      const existingSkuDoc = itemIdBySku.get(row.id.toLowerCase());
      if (!existingSkuDoc || !isCatalogUuid(existingSkuDoc)) {
        itemIdBySku.set(row.id.toLowerCase(), row.id);
      }
    }
    if (row.name) {
      const nameKey = itemNameLookupKey(row.name);
      const existing = itemIdByNormalizedName.get(nameKey);
      if (!existing || (!isCatalogUuid(existing) && isCatalogUuid(row.id))) {
        itemIdByNormalizedName.set(nameKey, row.id);
      }
    }
  }

  const variantByItemAndKey = new Map<string, CatalogVariantRow>();
  const variantByItemAndName = new Map<string, CatalogVariantRow>();
  for (const variant of variants) {
    const itemId = variant.item_id;
    if (!itemId) continue;
    const resolvedItemId = itemById.has(itemId) ? itemId : itemIdBySku.get(itemId.toLowerCase()) ?? itemId;
    const row: CatalogVariantRow = {
      id: variant.id,
      item_id: resolvedItemId,
      name: variant.name,
      sku: variant.sku,
    };
    variantByItemAndKey.set(variantLookupKey(resolvedItemId, variant.id), row);
    if (row.sku) variantByItemAndKey.set(variantLookupKey(resolvedItemId, row.sku), row);
    if (variant.variant_key) {
      variantByItemAndKey.set(variantLookupKey(resolvedItemId, variant.variant_key), row);
    }
    if (row.name) {
      const nameKey = variantNameLookupKey(resolvedItemId, row.name);
      const existing = variantByItemAndName.get(nameKey);
      if (!existing || (!isCatalogUuid(existing.id) && isCatalogUuid(row.id))) {
        variantByItemAndName.set(nameKey, row);
      }
    }
  }

  const menuGroupById = new Map<string, CatalogMenuGroupRow>();
  for (const group of menuGroups) {
    menuGroupById.set(group.id, group);
  }

  const outletIdSet = new Set(outletIds.map((id) => id.toLowerCase()));
  const posMapByOutletPosFlavour = new Map<string, PosItemMapRow>();
  for (const row of posMaps) {
    const outletId = row.outlet_id;
    if (outletId && outletIdSet.size > 0 && !outletIdSet.has(outletId.toLowerCase())) {
      continue;
    }
    const posItemId = row.pos_item_id;
    if (!posItemId) continue;
    const key = posMapLookupKey(outletId ?? "*", posItemId, row.pos_flavour_id);
    posMapByOutletPosFlavour.set(key, row);
    if (outletId) {
      posMapByOutletPosFlavour.set(posMapLookupKey("*", posItemId, row.pos_flavour_id), row);
    }
  }

  return {
    itemById,
    itemIdBySku,
    itemIdByNormalizedName,
    variantByItemAndKey,
    variantByItemAndName,
    menuGroupById,
    posMapByOutletPosFlavour,
  };
}

export async function loadMiddlewareSalesCatalogIndex(
  db: Firestore,
  outletIds: string[],
): Promise<MiddlewareSalesCatalogIndex> {
  const [itemsSnap, variantsSnap, menuGroupsSnap, posMapSnap] = await Promise.all([
    db.collection("catalog_items").get(),
    db.collection("catalog_variants").get(),
    db.collection("catalog_menu_groups").get(),
    db.collection("pos_item_map").get(),
  ]);

  const items: CatalogItemRow[] = itemsSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: asText(data.name),
      sku: asText(data.sku) ?? asText(data.itemSku),
      menu_group_id: asText(data.menu_group_id),
    };
  });

  const variants = variantsSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      item_id: asText(data.item_id) ?? asText(data.itemId) ?? asText(data.itemSku),
      name: asText(data.name),
      sku: asText(data.sku) ?? asText(data.variantSku),
      variant_key: asText(data.variant_key) ?? asText(data.variantKey),
    };
  });

  const menuGroups = menuGroupsSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: asText(data.name),
      pos_menu_group_id: asNullableInt(data.pos_menu_group_id),
    };
  });

  const posMaps = posMapSnap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        outlet_id: asText(data.outlet_id),
        pos_item_id: asText(data.pos_item_id),
        pos_flavour_id: asText(data.pos_flavour_id),
        catalog_item_id: asText(data.catalog_item_id),
        catalog_variant_key: asText(data.catalog_variant_key) ?? asText(data.normalized_variant_key),
      };
    })
    .filter((row): row is PosItemMapRow => Boolean(row.pos_item_id));

  return assembleMiddlewareSalesCatalogIndex(items, variants, menuGroups, posMaps, outletIds);
}

export async function loadSupabaseMiddlewareSalesCatalogIndex(
  outletIds: string[],
): Promise<MiddlewareSalesCatalogIndex> {
  const { getSupabaseAdmin } = await import("@/lib/supabase-server");
  const supabase = getSupabaseAdmin();

  const [itemsRes, variantsRes, menuGroupsRes, bindingsRes] = await Promise.all([
    supabase.from("catalog_items").select("id,name,sku,menu_group_id"),
    supabase.from("catalog_variants").select("id,item_id,name,sku,variant_key"),
    supabase.from("catalog_menu_groups").select("id,name,pos_menu_group_id"),
    supabase.from("outlet_pos_catalog_bindings").select(
      "outlet_id,item_sku,variant_sku,catalog_item_id,catalog_variant_key",
    ),
  ]);

  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (variantsRes.error) throw new Error(variantsRes.error.message);
  if (menuGroupsRes.error) throw new Error(menuGroupsRes.error.message);
  if (bindingsRes.error) throw new Error(bindingsRes.error.message);

  const items: CatalogItemRow[] = (itemsRes.data ?? []).map((row) => ({
    id: String(row.id),
    name: asText(row.name),
    sku: asText(row.sku),
    menu_group_id: row.menu_group_id ? String(row.menu_group_id) : null,
  }));

  const variants = (variantsRes.data ?? []).map((row) => ({
    id: String(row.id),
    item_id: row.item_id ? String(row.item_id) : null,
    name: asText(row.name),
    sku: asText(row.sku),
    variant_key: asText(row.variant_key),
  }));

  const menuGroups: CatalogMenuGroupRow[] = (menuGroupsRes.data ?? []).map((row) => ({
    id: String(row.id),
    name: asText(row.name),
    pos_menu_group_id: asNullableInt(row.pos_menu_group_id),
  }));

  const posMaps: PosItemMapRow[] = [];
  for (const row of bindingsRes.data ?? []) {
    const posItemId = asText(row.item_sku);
    if (!posItemId) continue;
    const variantSku = asText(row.variant_sku);
    posMaps.push({
      outlet_id: row.outlet_id ? String(row.outlet_id) : null,
      pos_item_id: posItemId,
      pos_flavour_id: variantSku && variantSku.length > 0 ? variantSku : null,
      catalog_item_id: row.catalog_item_id ? String(row.catalog_item_id) : null,
      catalog_variant_key: asText(row.catalog_variant_key),
    });
  }

  return assembleMiddlewareSalesCatalogIndex(items, variants, menuGroups, posMaps, outletIds);
}

export type RawSaleLineInput = {
  pos_item_id?: unknown;
  flavour_id?: unknown;
  item_sku?: unknown;
  variant_sku?: unknown;
  variant_id?: unknown;
  variant_key?: unknown;
  name?: unknown;
  flavour_name?: unknown;
};

export type ResolvedCatalogLine = {
  product_uuid: string;
  product_name: string | null;
  group_uuid: string | null;
  group_name: string | null;
  variant_uuid: string | null;
  variant_name: string | null;
  variant_sku: string | null;
  menu_group_uuid: string | null;
  menu_group_name: string | null;
  pos_menu_group_id: number | null;
};

function preferUuidCatalogId(index: MiddlewareSalesCatalogIndex, itemId: string | null): string | null {
  if (!itemId) return null;
  if (isCatalogUuid(itemId)) return itemId;

  const item = index.itemById.get(itemId);
  if (item?.sku) {
    const bySku = index.itemIdBySku.get(item.sku.toLowerCase());
    if (bySku && isCatalogUuid(bySku)) return bySku;
    for (const [id, row] of index.itemById) {
      if (isCatalogUuid(id) && row.sku?.toLowerCase() === item.sku?.toLowerCase()) {
        return id;
      }
    }
  }

  return itemId;
}

function resolveItemId(
  index: MiddlewareSalesCatalogIndex,
  options: {
    catalogItemId: string | null;
    itemSku: string | null;
    posItemId: string | null;
    lineName: string | null;
    flavourName: string | null;
  },
): string | null {
  const candidates: string[] = [];

  if (options.catalogItemId && index.itemById.has(options.catalogItemId)) {
    candidates.push(options.catalogItemId);
  }
  if (options.itemSku) {
    const bySku = index.itemIdBySku.get(options.itemSku.toLowerCase());
    if (bySku) candidates.push(bySku);
    if (index.itemById.has(options.itemSku)) candidates.push(options.itemSku);
  }
  if (options.posItemId) {
    const byPosSku = index.itemIdBySku.get(options.posItemId.toLowerCase());
    if (byPosSku) candidates.push(byPosSku);
    if (index.itemById.has(options.posItemId)) candidates.push(options.posItemId);
  }

  for (const candidate of candidates) {
    const preferred = preferUuidCatalogId(index, candidate);
    if (preferred) return preferred;
  }

  for (const name of [options.lineName, options.flavourName]) {
    if (!name) continue;
    const byName = index.itemIdByNormalizedName.get(itemNameLookupKey(name));
    if (byName) {
      const preferred = preferUuidCatalogId(index, byName);
      if (preferred) return preferred;
    }
    if (normalizeName(name) === "muffin") {
      const muffins = index.itemIdByNormalizedName.get("muffins");
      if (muffins) return preferUuidCatalogId(index, muffins);
    }
  }

  return null;
}

function preferUuidVariant(
  index: MiddlewareSalesCatalogIndex,
  itemId: string,
  variant: CatalogVariantRow | null,
  flavourName: string | null,
): CatalogVariantRow | null {
  if (!variant) return null;
  if (isCatalogUuid(variant.id)) return variant;

  const names = [variant.name, flavourName].filter((value): value is string => Boolean(value?.trim()));
  for (const name of names) {
    const byName = index.variantByItemAndName.get(variantNameLookupKey(itemId, name));
    if (byName && isCatalogUuid(byName.id)) return byName;
  }

  for (const candidate of index.variantByItemAndName.values()) {
    if (candidate.item_id !== itemId || !isCatalogUuid(candidate.id) || !candidate.name) continue;
    for (const name of names) {
      if (normalizeName(candidate.name) === normalizeName(name)) return candidate;
    }
  }

  return variant;
}

function resolveVariant(
  index: MiddlewareSalesCatalogIndex,
  itemId: string,
  options: {
    variantId: string | null;
    variantKey: string | null;
    variantSku: string | null;
    flavourId: string | null;
    flavourName: string | null;
    mapVariantKey: string | null;
  },
): CatalogVariantRow | null {
  const candidates = [
    options.mapVariantKey,
    options.variantId,
    options.variantKey,
    options.variantSku,
    options.flavourId,
  ].filter((value): value is string => Boolean(value && value.trim()));

  for (const candidate of candidates) {
    const normalized = normalizeVariantKey(candidate);
    const hit =
      index.variantByItemAndKey.get(variantLookupKey(itemId, candidate)) ??
      index.variantByItemAndKey.get(variantLookupKey(itemId, normalized));
    if (hit) return preferUuidVariant(index, itemId, hit, options.flavourName);
    if (isCatalogUuid(candidate)) {
      for (const variant of index.variantByItemAndKey.values()) {
        if (variant.id === candidate && variant.item_id === itemId) {
          return preferUuidVariant(index, itemId, variant, options.flavourName);
        }
      }
    }
  }

  if (options.flavourName) {
    const byName = index.variantByItemAndName.get(variantNameLookupKey(itemId, options.flavourName));
    if (byName) return preferUuidVariant(index, itemId, byName, options.flavourName);
  }

  return null;
}

function lookupPosItemMap(
  index: MiddlewareSalesCatalogIndex,
  outletId: string,
  posItemId: string,
  flavourId: string | null,
): PosItemMapRow | null {
  return (
    index.posMapByOutletPosFlavour.get(posMapLookupKey(outletId, posItemId, flavourId)) ??
    index.posMapByOutletPosFlavour.get(posMapLookupKey("*", posItemId, flavourId)) ??
    index.posMapByOutletPosFlavour.get(posMapLookupKey(outletId, posItemId, null)) ??
    index.posMapByOutletPosFlavour.get(posMapLookupKey("*", posItemId, null)) ??
    null
  );
}

export function resolveMiddlewareSaleCatalogLine(
  index: MiddlewareSalesCatalogIndex,
  outletId: string,
  row: RawSaleLineInput,
): ResolvedCatalogLine {
  const posItemId = asText(row.pos_item_id);
  const flavourId = asText(row.flavour_id);
  const itemSku = asText(row.item_sku) ?? posItemId;
  const variantSku = asText(row.variant_sku);
  const variantId = asText(row.variant_id);
  const variantKey = asText(row.variant_key);

  const lineName = asText(row.name);
  const flavourName = asText(row.flavour_name);
  const mapRow = posItemId ? lookupPosItemMap(index, outletId, posItemId, flavourId) : null;

  const itemId = resolveItemId(index, {
    catalogItemId: mapRow?.catalog_item_id ?? null,
    itemSku,
    posItemId,
    lineName,
    flavourName,
  });

  const item = itemId ? index.itemById.get(itemId) : undefined;
  const variant = itemId
    ? resolveVariant(index, itemId, {
        variantId,
        variantKey,
        variantSku,
        flavourId,
        flavourName,
        mapVariantKey: mapRow?.catalog_variant_key ?? null,
      })
    : null;

  const menuGroupId = item?.menu_group_id ?? null;
  const menuGroup = menuGroupId ? index.menuGroupById.get(menuGroupId) : undefined;
  const groupUuid = menuGroup?.id ?? (isCatalogUuid(menuGroupId) ? menuGroupId : null);

  const resolvedItemId = itemId ? preferUuidCatalogId(index, itemId) ?? itemId : null;
  const variantUuid = variant && isCatalogUuid(variant.id) ? variant.id : null;
  const productUuid =
    variantUuid ??
    (resolvedItemId && isCatalogUuid(resolvedItemId) ? resolvedItemId : resolvedItemId ?? "unknown");

  return {
    product_uuid: productUuid,
    product_name: variant?.name ?? item?.name ?? lineName,
    group_uuid: groupUuid,
    group_name: menuGroup?.name ?? null,
    variant_uuid: variantUuid,
    variant_name: variant?.name ?? flavourName,
    variant_sku: variant?.sku ?? variantSku,
    menu_group_uuid: groupUuid,
    menu_group_name: menuGroup?.name ?? null,
    pos_menu_group_id: menuGroup?.pos_menu_group_id ?? null,
  };
}
