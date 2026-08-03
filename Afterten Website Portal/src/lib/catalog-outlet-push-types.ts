export type MenuGroupPushSummary = {
  id: string;
  name: string;
  pos_menu_group_id: number | null;
  active: boolean;
  item_count: number;
  variant_count: number;
};

export type CatalogPushScope = {
  sync_menu_groups: boolean;
  sync_products: boolean;
  sync_variants: boolean;
};

export type CatalogPushPickerItem = {
  id: string;
  name: string;
  sku: string | null;
  menu_group_id: string | null;
  menu_group_name: string | null;
  variant_count: number;
};

export type CatalogPushPickerVariant = {
  id: string;
  item_id: string;
  item_name: string;
  name: string;
  sku: string | null;
  menu_group_id: string | null;
};

export type CatalogPushPickerCatalog = {
  groups: MenuGroupPushSummary[];
  items: CatalogPushPickerItem[];
  variants: CatalogPushPickerVariant[];
};

export type CatalogPushCandidate = {
  entity_type: "menu_group" | "item" | "variant";
  entity_id: string;
  payload: Record<string, unknown>;
  menu_group_id: string | null;
};
