import {
  listFirestoreCatalogItems,
  listFirestoreCatalogVariants,
  listFirestoreMenuGroups,
} from "@/lib/firestore-catalog-store";
import {
  buildCatalogPushCandidatesFromLoaded,
  explainCatalogPushGapFromItems,
  type CatalogPushPickerCatalog,
  type LoadedGroupCatalog,
  type MenuGroupPushSummary,
} from "@/lib/catalog-outlet-push";
import { filterFirestoreOutletsByScope, listFirestoreOutlets } from "@/lib/firestore-outlets";

const FINISHED_ITEM_KIND = "finished";

type MenuGroupRow = {
  id: string;
  name: string;
  pos_menu_group_id: number | null;
  active: boolean;
};

type ItemRow = {
  id: string;
  name: string;
  sku: string | null;
  selling_price: number | null;
  menu_group_id: string | null;
  item_kind: string | null;
  active: boolean | null;
};

type VariantRow = {
  id: string;
  item_id: string;
  name: string;
  sku: string | null;
  selling_price: number | null;
  item_kind: string | null;
  active: boolean | null;
};

function asMenuGroupRow(row: Record<string, unknown>): MenuGroupRow {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    pos_menu_group_id: typeof row.pos_menu_group_id === "number" ? row.pos_menu_group_id : null,
    active: row.active !== false,
  };
}

function asItemRow(row: Record<string, unknown>): ItemRow {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    sku: typeof row.sku === "string" ? row.sku : null,
    selling_price: typeof row.selling_price === "number" ? row.selling_price : null,
    menu_group_id: typeof row.menu_group_id === "string" ? row.menu_group_id : null,
    item_kind: typeof row.item_kind === "string" ? row.item_kind : null,
    active: row.active !== false,
  };
}

function asVariantRow(row: Record<string, unknown>): VariantRow {
  return {
    id: String(row.id ?? ""),
    item_id: String(row.item_id ?? ""),
    name: String(row.name ?? ""),
    sku: typeof row.sku === "string" ? row.sku : null,
    selling_price: typeof row.selling_price === "number" ? row.selling_price : null,
    item_kind: typeof row.item_kind === "string" ? row.item_kind : null,
    active: row.active !== false,
  };
}

function isFinishedItem(item: ItemRow): boolean {
  const kind = (item.item_kind ?? FINISHED_ITEM_KIND).trim().toLowerCase();
  return kind === "finished" || kind === "product";
}

function isPushableItem(item: ItemRow): boolean {
  return isFinishedItem(item) && item.active !== false && Boolean(item.menu_group_id) && Boolean(item.sku?.trim());
}

export async function middlewareFirestoreOutletIds(requestedIds: string[]): Promise<string[]> {
  const outlets = filterFirestoreOutletsByScope(await listFirestoreOutlets(), "middleware");
  const allowed = new Set(outlets.map((outlet) => outlet.id));
  const outletIds =
    requestedIds.length > 0 ? requestedIds.filter((id) => allowed.has(id)) : Array.from(allowed);
  return outletIds;
}

export async function loadFirestoreMenuGroupPushSummaries(): Promise<MenuGroupPushSummary[]> {
  const [groupsRaw, itemsRaw, variantsRaw] = await Promise.all([
    listFirestoreMenuGroups(),
    listFirestoreCatalogItems(),
    listFirestoreCatalogVariants({ activeOnly: false }),
  ]);

  const groups = groupsRaw.map(asMenuGroupRow).filter((group) => group.active !== false);
  const items = itemsRaw.map(asItemRow).filter(isFinishedItem);
  const pushableItems = items.filter(isPushableItem);
  const variants = variantsRaw.map(asVariantRow).filter((variant) => variant.active !== false);
  const activeItemIds = new Set(pushableItems.map((item) => item.id));

  const itemCountByGroup = new Map<string, number>();
  const variantCountByGroup = new Map<string, number>();

  for (const item of pushableItems) {
    if (!item.menu_group_id) continue;
    itemCountByGroup.set(item.menu_group_id, (itemCountByGroup.get(item.menu_group_id) ?? 0) + 1);
  }

  for (const variant of variants) {
    if (!activeItemIds.has(variant.item_id) || !variant.sku?.trim()) continue;
    const parent = pushableItems.find((item) => item.id === variant.item_id);
    if (!parent?.menu_group_id) continue;
    variantCountByGroup.set(
      parent.menu_group_id,
      (variantCountByGroup.get(parent.menu_group_id) ?? 0) + 1,
    );
  }

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    pos_menu_group_id: group.pos_menu_group_id,
    active: group.active,
    item_count: itemCountByGroup.get(group.id) ?? 0,
    variant_count: variantCountByGroup.get(group.id) ?? 0,
  }));
}

export async function loadFirestoreCatalogPushPickerCatalog(): Promise<CatalogPushPickerCatalog> {
  const groups = await loadFirestoreMenuGroupPushSummaries();
  const groupsById = new Map(groups.map((group) => [group.id, group.name] as const));

  const items = (await listFirestoreCatalogItems())
    .map(asItemRow)
    .filter(isFinishedItem)
    .filter(isPushableItem);

  const itemIds = items.map((item) => item.id);
  const itemsById = new Map(items.map((item) => [item.id, item] as const));
  let variants: VariantRow[] = [];

  if (itemIds.length) {
    const allVariants = await listFirestoreCatalogVariants({ activeOnly: false });
    variants = allVariants
      .map(asVariantRow)
      .filter((variant) => itemIds.includes(variant.item_id))
      .filter((variant) => variant.active !== false && variant.sku?.trim());
  }

  const variantCountByItem = new Map<string, number>();
  for (const variant of variants) {
    variantCountByItem.set(variant.item_id, (variantCountByItem.get(variant.item_id) ?? 0) + 1);
  }

  return {
    groups,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      menu_group_id: item.menu_group_id,
      menu_group_name: item.menu_group_id ? groupsById.get(item.menu_group_id) ?? null : null,
      variant_count: variantCountByItem.get(item.id) ?? 0,
    })),
    variants: variants.map((variant) => {
      const parent = itemsById.get(variant.item_id);
      return {
        id: variant.id,
        item_id: variant.item_id,
        item_name: parent?.name ?? "",
        name: variant.name,
        sku: variant.sku,
        menu_group_id: parent?.menu_group_id ?? null,
      };
    }),
  };
}

export async function loadFirestoreGroupCatalogData(menuGroupIds: string[]): Promise<LoadedGroupCatalog> {
  const uniqueGroupIds = new Set(menuGroupIds.filter(Boolean));
  const [groupsRaw, itemsRaw] = await Promise.all([
    listFirestoreMenuGroups(),
    listFirestoreCatalogItems(),
  ]);

  const groups = groupsRaw
    .map(asMenuGroupRow)
    .filter((group) => uniqueGroupIds.has(group.id) && group.active !== false);

  const items = itemsRaw
    .map(asItemRow)
    .filter((item) => item.menu_group_id && uniqueGroupIds.has(item.menu_group_id))
    .filter(isFinishedItem)
    .filter(isPushableItem);

  const itemIds = items.map((item) => item.id);
  const itemsById = new Map(items.map((item) => [item.id, item] as const));
  let variants: VariantRow[] = [];

  if (itemIds.length) {
    const allVariants = await listFirestoreCatalogVariants({ activeOnly: false });
    variants = allVariants
      .map(asVariantRow)
      .filter((variant) => itemIds.includes(variant.item_id))
      .filter((variant) => variant.active !== false && variant.sku?.trim());
  }

  const variantsByItemId = new Map<string, VariantRow[]>();
  for (const variant of variants) {
    const current = variantsByItemId.get(variant.item_id) ?? [];
    current.push(variant);
    variantsByItemId.set(variant.item_id, current);
  }

  return { groups, items, variants, variantsByItemId };
}

export async function loadFirestoreItemsAndVariantsForPush(
  menuGroupIds: string[],
  itemIds: string[],
  variantIds: string[],
): Promise<LoadedGroupCatalog> {
  const uniqueGroupIds = Array.from(new Set(menuGroupIds.filter(Boolean)));
  if (uniqueGroupIds.length) {
    return loadFirestoreGroupCatalogData(uniqueGroupIds);
  }

  const uniqueItemIds = Array.from(new Set(itemIds.filter(Boolean)));
  const uniqueVariantIds = Array.from(new Set(variantIds.filter(Boolean)));

  if (!uniqueItemIds.length && uniqueVariantIds.length) {
    const allVariants = await listFirestoreCatalogVariants({ activeOnly: false });
    for (const row of allVariants) {
      const variant = asVariantRow(row);
      if (uniqueVariantIds.includes(variant.id) && variant.item_id) {
        uniqueItemIds.push(variant.item_id);
      }
    }
  }

  if (!uniqueItemIds.length) {
    return { groups: [], items: [], variants: [], variantsByItemId: new Map() };
  }

  const items = (await listFirestoreCatalogItems())
    .map(asItemRow)
    .filter((item) => uniqueItemIds.includes(item.id))
    .filter(isFinishedItem)
    .filter(isPushableItem);

  const itemsById = new Map(items.map((item) => [item.id, item] as const));
  const groupIds = Array.from(
    new Set(items.map((item) => item.menu_group_id).filter((id): id is string => Boolean(id))),
  );

  const groups = (await listFirestoreMenuGroups())
    .map(asMenuGroupRow)
    .filter((group) => groupIds.includes(group.id) && group.active !== false);

  let variants: VariantRow[] = [];
  const allVariants = await listFirestoreCatalogVariants({ activeOnly: false });
  if (uniqueVariantIds.length) {
    variants = allVariants
      .map(asVariantRow)
      .filter((variant) => uniqueVariantIds.includes(variant.id))
      .filter((variant) => variant.active !== false && variant.sku?.trim());
  } else if (items.length) {
    const ids = new Set(items.map((item) => item.id));
    variants = allVariants
      .map(asVariantRow)
      .filter((variant) => ids.has(variant.item_id))
      .filter((variant) => variant.active !== false && variant.sku?.trim());
  }

  const variantsByItemId = new Map<string, VariantRow[]>();
  for (const variant of variants) {
    const current = variantsByItemId.get(variant.item_id) ?? [];
    current.push(variant);
    variantsByItemId.set(variant.item_id, current);
  }

  return { groups, items, variants, variantsByItemId };
}

export async function buildFirestoreCatalogPushCandidates(
  menuGroupIds: string[],
  options?: {
    includeEmptyGroups?: boolean;
    scope?: import("@/lib/catalog-outlet-push").CatalogPushScope;
    item_ids?: string[];
    variant_ids?: string[];
  },
) {
  const itemIdFilter = new Set((options?.item_ids ?? []).filter(Boolean));
  const variantIdFilter = new Set((options?.variant_ids ?? []).filter(Boolean));
  const uniqueGroupIds = Array.from(new Set(menuGroupIds.filter(Boolean)));
  const loaded = await loadFirestoreItemsAndVariantsForPush(
    uniqueGroupIds,
    Array.from(itemIdFilter),
    Array.from(variantIdFilter),
  );

  return buildCatalogPushCandidatesFromLoaded(loaded, uniqueGroupIds, {
    ...options,
    itemIdFilter,
    variantIdFilter,
    hasItemFilter: itemIdFilter.size > 0,
    hasVariantFilter: variantIdFilter.size > 0,
  });
}

export async function explainFirestoreCatalogPushGap(menuGroupIds: string[]): Promise<string> {
  const groupIds = Array.from(new Set(menuGroupIds.filter(Boolean)));
  const items = (await listFirestoreCatalogItems())
    .map(asItemRow)
    .filter((item) => item.menu_group_id && groupIds.includes(item.menu_group_id))
    .filter(isFinishedItem);
  return explainCatalogPushGapFromItems(items);
}
