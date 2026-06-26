import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildItemMiddlewarePayload,
  buildVariantMiddlewarePayload,
  enqueueCatalogSyncForOutlet,
  withCatalogSyncMode,
  withCatalogSyncSchedule,
  type CatalogSyncMode,
} from "@/lib/catalog-middleware";
import type { MenuGroupSyncFields } from "@/lib/catalogMenuGroup";

export type MenuGroupPushSummary = {
  id: string;
  name: string;
  pos_menu_group_id: number | null;
  active: boolean;
  item_count: number;
  variant_count: number;
};

export type CatalogPushCandidate = {
  entity_type: "menu_group" | "item" | "variant";
  entity_id: string;
  payload: Record<string, unknown>;
  menu_group_id: string | null;
};

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
  active: boolean | null;
};

function groupFieldsFromRow(group: MenuGroupRow): MenuGroupSyncFields {
  return {
    menu_group_id: group.id,
    menu_group_name: group.name ?? null,
    pos_menu_group_id: typeof group.pos_menu_group_id === "number" ? group.pos_menu_group_id : null,
  };
}

function cleanedSkuList(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) continue;
    if (!result.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
      result.push(normalized);
    }
  }
  return result;
}

type LoadedGroupCatalog = {
  groups: MenuGroupRow[];
  items: ItemRow[];
  variants: VariantRow[];
  variantsByItemId: Map<string, VariantRow[]>;
};

async function loadGroupCatalogData(
  supabase: SupabaseClient,
  menuGroupIds: string[]
): Promise<LoadedGroupCatalog> {
  const uniqueGroupIds = Array.from(new Set(menuGroupIds.filter(Boolean)));
  const [groupsRes, itemsRes] = await Promise.all([
    supabase
      .from("catalog_menu_groups")
      .select("id,name,pos_menu_group_id,active")
      .in("id", uniqueGroupIds),
    supabase
      .from("catalog_items")
      .select("id,name,sku,selling_price,menu_group_id,item_kind,active")
      .in("menu_group_id", uniqueGroupIds)
      .eq("item_kind", "finished"),
  ]);

  if (groupsRes.error) throw groupsRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const groups = ((groupsRes.data ?? []) as MenuGroupRow[]).filter((group) => group.active !== false);
  const items = ((itemsRes.data ?? []) as ItemRow[]).filter(
    (item) => item.active !== false && item.menu_group_id && item.sku?.trim()
  );

  const itemIds = items.map((item) => item.id);
  let variants: VariantRow[] = [];
  if (itemIds.length) {
    const variantsRes = await supabase
      .from("catalog_variants")
      .select("id,item_id,name,sku,selling_price,active")
      .in("item_id", itemIds);
    if (variantsRes.error) throw variantsRes.error;
    variants = ((variantsRes.data ?? []) as VariantRow[]).filter(
      (variant) => variant.active !== false && variant.sku?.trim()
    );
  }

  const variantsByItemId = new Map<string, VariantRow[]>();
  for (const variant of variants) {
    const current = variantsByItemId.get(variant.item_id) ?? [];
    current.push(variant);
    variantsByItemId.set(variant.item_id, current);
  }

  return { groups, items, variants, variantsByItemId };
}

export type CatalogRemoveCandidate = {
  entity_type: "delete";
  entity_id: string;
  catalog_entity_type: "menu_group" | "item" | "variant";
  menu_group_id: string | null;
  payload: Record<string, unknown>;
};

export async function buildCatalogRemoveCandidates(
  supabase: SupabaseClient,
  menuGroupIds: string[],
  options?: { includeEmptyGroups?: boolean }
): Promise<CatalogRemoveCandidate[]> {
  const uniqueGroupIds = Array.from(new Set(menuGroupIds.filter(Boolean)));
  if (!uniqueGroupIds.length) return [];

  const includeEmptyGroups = options?.includeEmptyGroups === true;
  const { groups, items, variants, variantsByItemId } = await loadGroupCatalogData(supabase, uniqueGroupIds);

  const groupsById = new Map(groups.map((group) => [group.id, group] as const));
  const itemCountByGroup = new Map<string, number>();
  for (const item of items) {
    if (!item.menu_group_id) continue;
    itemCountByGroup.set(item.menu_group_id, (itemCountByGroup.get(item.menu_group_id) ?? 0) + 1);
  }

  const candidates: CatalogRemoveCandidate[] = [];

  for (const variant of variants) {
    const parent = items.find((item) => item.id === variant.item_id);
    if (!parent?.menu_group_id) continue;
    const group = groupsById.get(parent.menu_group_id);
    if (!group) continue;

    const variantSkus = cleanedSkuList([variant.sku]);
    if (!variantSkus.length) continue;

    candidates.push({
      entity_type: "delete",
      entity_id: variant.id,
      catalog_entity_type: "variant",
      menu_group_id: parent.menu_group_id,
      payload: {
        delete_type: "variant",
        item_id: parent.id,
        variant_sku: variant.sku,
        variant_skus: variantSkus,
        variant_name: variant.name,
        menu_group_id: parent.menu_group_id,
      },
    });
  }

  for (const item of items) {
    if (!item.menu_group_id) continue;
    const group = groupsById.get(item.menu_group_id);
    if (!group) continue;

    const itemSkus = cleanedSkuList([item.sku]);
    if (!itemSkus.length) continue;

    const childVariants = variantsByItemId.get(item.id) ?? [];
    const allVariantSkus = cleanedSkuList(childVariants.map((row) => row.sku));

    candidates.push({
      entity_type: "delete",
      entity_id: item.id,
      catalog_entity_type: "item",
      menu_group_id: item.menu_group_id,
      payload: {
        delete_type: "item",
        item_sku: item.sku,
        item_skus: itemSkus,
        all_variant_skus: allVariantSkus,
        variant_skus: allVariantSkus,
        name: item.name,
        menu_group_id: item.menu_group_id,
      },
    });
  }

  for (const groupId of uniqueGroupIds) {
    const group = groupsById.get(groupId);
    if (!group) continue;
    const itemCount = itemCountByGroup.get(groupId) ?? 0;
    if (!includeEmptyGroups && itemCount === 0) continue;

    candidates.push({
      entity_type: "delete",
      entity_id: group.id,
      catalog_entity_type: "menu_group",
      menu_group_id: group.id,
      payload: {
        delete_type: "menu_group",
        menu_group_id: group.id,
        menu_group_name: group.name,
        pos_menu_group_id: group.pos_menu_group_id,
        name: group.name,
      },
    });
  }

  return sortRemoveCandidates(candidates);
}

export function sortRemoveCandidates(candidates: CatalogRemoveCandidate[]): CatalogRemoveCandidate[] {
  const order = { variant: 0, item: 1, menu_group: 2 } as const;
  return [...candidates].sort((a, b) => {
    const typeDiff = order[a.catalog_entity_type] - order[b.catalog_entity_type];
    if (typeDiff !== 0) return typeDiff;
    return a.entity_id.localeCompare(b.entity_id);
  });
}

function buildOutletSyncPayload(
  payload: Record<string, unknown>,
  options?: { scheduledAt?: string | null; syncMode?: CatalogSyncMode }
): Record<string, unknown> {
  const syncMode = options?.syncMode ?? "insert_only";
  return withCatalogSyncSchedule(withCatalogSyncMode(payload, syncMode), options?.scheduledAt);
}

export async function removeCatalogCandidatesFromOutlets(
  supabase: SupabaseClient,
  outletIds: string[],
  candidates: CatalogRemoveCandidate[],
  options?: { scheduledAt?: string | null }
) {
  const scheduledAt = options?.scheduledAt ?? null;
  for (const outletId of outletIds) {
    for (const candidate of candidates) {
      await enqueueCatalogSyncForOutlet(
        supabase,
        outletId,
        "delete",
        candidate.entity_id,
        withCatalogSyncSchedule(candidate.payload, scheduledAt)
      );
    }
  }
}

export async function loadMenuGroupPushSummaries(supabase: SupabaseClient): Promise<MenuGroupPushSummary[]> {
  const [groupsRes, itemsRes, variantsRes] = await Promise.all([
    supabase
      .from("catalog_menu_groups")
      .select("id,name,pos_menu_group_id,active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("catalog_items")
      .select("id,menu_group_id,item_kind,active")
      .eq("item_kind", "finished"),
    supabase.from("catalog_variants").select("id,item_id,active"),
  ]);

  if (groupsRes.error) throw groupsRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (variantsRes.error) throw variantsRes.error;

  const items = (itemsRes.data ?? []) as ItemRow[];
  const variants = (variantsRes.data ?? []) as VariantRow[];
  const activeItemIds = new Set(
    items.filter((item) => item.active !== false && item.menu_group_id).map((item) => item.id)
  );

  const itemCountByGroup = new Map<string, number>();
  const variantCountByGroup = new Map<string, number>();

  for (const item of items) {
    if (!item.menu_group_id || item.active === false) continue;
    itemCountByGroup.set(item.menu_group_id, (itemCountByGroup.get(item.menu_group_id) ?? 0) + 1);
  }

  for (const variant of variants) {
    if (variant.active === false || !activeItemIds.has(variant.item_id)) continue;
    const parent = items.find((item) => item.id === variant.item_id);
    if (!parent?.menu_group_id) continue;
    variantCountByGroup.set(
      parent.menu_group_id,
      (variantCountByGroup.get(parent.menu_group_id) ?? 0) + 1
    );
  }

  return ((groupsRes.data ?? []) as MenuGroupRow[]).map((group) => ({
    id: group.id,
    name: group.name,
    pos_menu_group_id: group.pos_menu_group_id,
    active: group.active,
    item_count: itemCountByGroup.get(group.id) ?? 0,
    variant_count: variantCountByGroup.get(group.id) ?? 0,
  }));
}

export async function buildCatalogPushCandidates(
  supabase: SupabaseClient,
  menuGroupIds: string[],
  options?: { includeEmptyGroups?: boolean }
): Promise<CatalogPushCandidate[]> {
  const uniqueGroupIds = Array.from(new Set(menuGroupIds.filter(Boolean)));
  if (!uniqueGroupIds.length) return [];

  const includeEmptyGroups = options?.includeEmptyGroups === true;
  const { groups, items, variants } = await loadGroupCatalogData(supabase, uniqueGroupIds);

  const itemCountByGroup = new Map<string, number>();
  for (const item of items) {
    if (!item.menu_group_id) continue;
    itemCountByGroup.set(item.menu_group_id, (itemCountByGroup.get(item.menu_group_id) ?? 0) + 1);
  }

  const groupsById = new Map(groups.map((group) => [group.id, group] as const));
  const itemsById = new Map(items.map((item) => [item.id, item] as const));

  const candidates: CatalogPushCandidate[] = [];

  for (const groupId of uniqueGroupIds) {
    const group = groupsById.get(groupId);
    if (!group) continue;
    const itemCount = itemCountByGroup.get(groupId) ?? 0;
    if (!includeEmptyGroups && itemCount === 0) continue;

    candidates.push({
      entity_type: "menu_group",
      entity_id: group.id,
      menu_group_id: group.id,
      payload: {
        change_type: "upsert_menu_group",
        name: group.name,
        pos_menu_group_id: group.pos_menu_group_id,
        menu_group_id: group.id,
        menu_group_name: group.name,
      },
    });
  }

  for (const item of items) {
    if (!item.menu_group_id) continue;
    const group = groupsById.get(item.menu_group_id);
    if (!group) continue;
    if (!includeEmptyGroups && (itemCountByGroup.get(item.menu_group_id) ?? 0) === 0) continue;

    candidates.push({
      entity_type: "item",
      entity_id: item.id,
      menu_group_id: item.menu_group_id,
      payload: buildItemMiddlewarePayload({
        sku: item.sku,
        name: item.name,
        sellingPrice: item.selling_price,
        groupFields: groupFieldsFromRow(group),
      }),
    });
  }

  for (const variant of variants) {
    const parent = itemsById.get(variant.item_id);
    if (!parent?.menu_group_id) continue;
    const group = groupsById.get(parent.menu_group_id);
    if (!group) continue;

    candidates.push({
      entity_type: "variant",
      entity_id: variant.id,
      menu_group_id: parent.menu_group_id,
      payload: buildVariantMiddlewarePayload({
        itemSku: parent.sku,
        variantSku: variant.sku,
        variantName: variant.name,
        sellingPrice: variant.selling_price,
        posFlavourId: variant.id,
        groupFields: groupFieldsFromRow(group),
      }),
    });
  }

  return sortPushCandidates(candidates);
}

export function sortPushCandidates(candidates: CatalogPushCandidate[]): CatalogPushCandidate[] {
  const order = { menu_group: 0, item: 1, variant: 2 } as const;
  return [...candidates].sort((a, b) => {
    const typeDiff = order[a.entity_type] - order[b.entity_type];
    if (typeDiff !== 0) return typeDiff;
    return a.entity_id.localeCompare(b.entity_id);
  });
}

export function filterCandidatesByMenuGroups(
  candidates: Array<{ menu_group_id?: string | null; payload?: Record<string, unknown> }>,
  menuGroupIds: string[]
): typeof candidates {
  const allowed = new Set(menuGroupIds);
  if (!allowed.size) return [];

  return candidates.filter((candidate) => {
    const fromPayload =
      typeof candidate.payload?.menu_group_id === "string" ? candidate.payload.menu_group_id : null;
    const groupId = candidate.menu_group_id ?? fromPayload;
    return groupId ? allowed.has(groupId) : false;
  });
}

export async function pushCatalogCandidatesToOutlets(
  supabase: SupabaseClient,
  outletIds: string[],
  candidates: CatalogPushCandidate[],
  options?: { scheduledAt?: string | null; syncMode?: CatalogSyncMode }
) {
  for (const outletId of outletIds) {
    for (const candidate of candidates) {
      await enqueueCatalogSyncForOutlet(
        supabase,
        outletId,
        candidate.entity_type,
        candidate.entity_id,
        buildOutletSyncPayload(candidate.payload, options)
      );
    }
  }
}
