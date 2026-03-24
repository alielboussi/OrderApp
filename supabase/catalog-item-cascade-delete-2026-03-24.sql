-- Enable hard-delete cascades for catalog item related records.

alter table public.order_items
  drop constraint if exists order_items_product_id_fkey;
alter table public.order_items
  add constraint order_items_product_id_fkey
  foreign key (product_id) references public.catalog_items(id) on delete cascade;

alter table public.recipes
  drop constraint if exists item_ingredient_recipes_ingredient_item_id_fkey;
alter table public.recipes
  add constraint item_ingredient_recipes_ingredient_item_id_fkey
  foreign key (ingredient_item_id) references public.catalog_items(id) on delete cascade;

alter table public.warehouse_purchase_items
  drop constraint if exists warehouse_purchase_items_item_id_fkey;
alter table public.warehouse_purchase_items
  add constraint warehouse_purchase_items_item_id_fkey
  foreign key (item_id) references public.catalog_items(id) on delete cascade;

alter table public.warehouse_transfer_items
  drop constraint if exists warehouse_transfer_items_item_id_fkey;
alter table public.warehouse_transfer_items
  add constraint warehouse_transfer_items_item_id_fkey
  foreign key (item_id) references public.catalog_items(id) on delete cascade;

alter table public.warehouse_stock_counts
  drop constraint if exists warehouse_stock_counts_item_id_fkey;
alter table public.warehouse_stock_counts
  add constraint warehouse_stock_counts_item_id_fkey
  foreign key (item_id) references public.catalog_items(id) on delete cascade;

alter table public.pos_item_map
  drop constraint if exists pos_item_map_catalog_item_id_fkey;
alter table public.pos_item_map
  add constraint pos_item_map_catalog_item_id_fkey
  foreign key (catalog_item_id) references public.catalog_items(id) on delete cascade;
