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
  variantByItemAndKey: Map<string, CatalogVariantRow>;
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

  const itemById = new Map<string, CatalogItemRow>();
  const itemIdBySku = new Map<string, string>();

  for (const doc of itemsSnap.docs) {
    const data = doc.data();
    const sku = asText(data.sku) ?? asText(data.itemSku);
    const row: CatalogItemRow = {
      id: doc.id,
      name: asText(data.name),
      sku,
      menu_group_id: asText(data.menu_group_id),
    };
    itemById.set(doc.id, row);
    if (sku) {
      const skuKey = sku.toLowerCase();
      const existing = itemIdBySku.get(skuKey);
      if (!existing || (!isCatalogUuid(existing) && isCatalogUuid(doc.id))) {
        itemIdBySku.set(skuKey, doc.id);
      }
    }
    if (!isCatalogUuid(doc.id)) {
      itemIdBySku.set(doc.id.toLowerCase(), doc.id);
    }
  }

  const variantByItemAndKey = new Map<string, CatalogVariantRow>();
  for (const doc of variantsSnap.docs) {
    const data = doc.data();
    const itemId = asText(data.item_id) ?? asText(data.itemId) ?? asText(data.itemSku);
    if (!itemId) continue;
    const resolvedItemId = itemById.has(itemId) ? itemId : itemIdBySku.get(itemId.toLowerCase()) ?? itemId;
    const row: CatalogVariantRow = {
      id: doc.id,
      item_id: resolvedItemId,
      name: asText(data.name),
      sku: asText(data.sku) ?? asText(data.variantSku),
    };
    variantByItemAndKey.set(variantLookupKey(resolvedItemId, doc.id), row);
    if (row.sku) variantByItemAndKey.set(variantLookupKey(resolvedItemId, row.sku), row);
    const variantKey = asText(data.variant_key) ?? asText(data.variantKey);
    if (variantKey) variantByItemAndKey.set(variantLookupKey(resolvedItemId, variantKey), row);
  }

  const menuGroupById = new Map<string, CatalogMenuGroupRow>();
  for (const doc of menuGroupsSnap.docs) {
    const data = doc.data();
    menuGroupById.set(doc.id, {
      id: doc.id,
      name: asText(data.name),
      pos_menu_group_id: asNullableInt(data.pos_menu_group_id),
    });
  }

  const outletIdSet = new Set(outletIds.map((id) => id.toLowerCase()));
  const posMapByOutletPosFlavour = new Map<string, PosItemMapRow>();
  for (const doc of posMapSnap.docs) {
    const data = doc.data();
    const outletId = asText(data.outlet_id);
    if (outletId && outletIdSet.size > 0 && !outletIdSet.has(outletId.toLowerCase())) {
      continue;
    }
    const posItemId = asText(data.pos_item_id);
    if (!posItemId) continue;
    const row: PosItemMapRow = {
      outlet_id: outletId,
      pos_item_id: posItemId,
      pos_flavour_id: asText(data.pos_flavour_id),
      catalog_item_id: asText(data.catalog_item_id),
      catalog_variant_key: asText(data.catalog_variant_key) ?? asText(data.normalized_variant_key),
    };
    const key = posMapLookupKey(outletId ?? "*", posItemId, row.pos_flavour_id);
    posMapByOutletPosFlavour.set(key, row);
    if (outletId) {
      posMapByOutletPosFlavour.set(posMapLookupKey("*", posItemId, row.pos_flavour_id), row);
    }
  }

  return {
    itemById,
    itemIdBySku,
    variantByItemAndKey,
    menuGroupById,
    posMapByOutletPosFlavour,
  };
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

  return null;
}

function resolveVariant(
  index: MiddlewareSalesCatalogIndex,
  itemId: string,
  options: {
    variantId: string | null;
    variantKey: string | null;
    variantSku: string | null;
    flavourId: string | null;
    mapVariantKey: string | null;
  },
): CatalogVariantRow | null {
  const candidates = [
    options.variantId,
    options.mapVariantKey,
    options.variantKey,
    options.variantSku,
    options.flavourId,
  ].filter((value): value is string => Boolean(value && value.trim()));

  for (const candidate of candidates) {
    const normalized = normalizeVariantKey(candidate);
    const hit =
      index.variantByItemAndKey.get(variantLookupKey(itemId, candidate)) ??
      index.variantByItemAndKey.get(variantLookupKey(itemId, normalized));
    if (hit) return hit;
    if (isCatalogUuid(candidate) && index.variantByItemAndKey.has(variantLookupKey(itemId, candidate))) {
      return index.variantByItemAndKey.get(variantLookupKey(itemId, candidate)) ?? null;
    }
  }

  if (isCatalogUuid(options.variantId)) {
    for (const variant of index.variantByItemAndKey.values()) {
      if (variant.id === options.variantId && variant.item_id === itemId) return variant;
    }
  }

  return null;
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

  const mapRow =
    (posItemId
      ? index.posMapByOutletPosFlavour.get(posMapLookupKey(outletId, posItemId, flavourId)) ??
        index.posMapByOutletPosFlavour.get(posMapLookupKey("*", posItemId, flavourId))
      : null) ?? null;

  const itemId = resolveItemId(index, {
    catalogItemId: mapRow?.catalog_item_id ?? null,
    itemSku,
    posItemId,
  });

  const item = itemId ? index.itemById.get(itemId) : undefined;
  const variant = itemId
    ? resolveVariant(index, itemId, {
        variantId,
        variantKey,
        variantSku,
        flavourId,
        mapVariantKey: mapRow?.catalog_variant_key ?? null,
      })
    : null;

  const menuGroupId = item?.menu_group_id ?? null;
  const menuGroup = menuGroupId ? index.menuGroupById.get(menuGroupId) : undefined;
  const groupUuid = menuGroup?.id ?? (isCatalogUuid(menuGroupId) ? menuGroupId : null);

  const productUuid = itemId ? (isCatalogUuid(itemId) ? itemId : preferUuidCatalogId(index, itemId) ?? itemId) : "unknown";
  const variantUuid = variant ? (isCatalogUuid(variant.id) ? variant.id : null) : null;

  return {
    product_uuid: productUuid,
    product_name: item?.name ?? asText(row.name),
    group_uuid: groupUuid,
    group_name: menuGroup?.name ?? null,
    variant_uuid: variantUuid,
    variant_name: variant?.name ?? asText(row.flavour_name),
    variant_sku: variant?.sku ?? variantSku,
    menu_group_uuid: groupUuid,
    menu_group_name: menuGroup?.name ?? null,
    pos_menu_group_id: menuGroup?.pos_menu_group_id ?? null,
  };
}
