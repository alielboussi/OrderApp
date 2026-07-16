-- Allow the same catalog name for different item kinds (e.g. ingredient "Sugar" + finished "Sugar").
-- Previously: unique on lower(name) only — blocked ingredient + finished with the same name.

DROP INDEX IF EXISTS public.idx_catalog_items_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_name_item_kind_unique
  ON public.catalog_items (lower(name), item_kind);

SELECT 'catalog name uniqueness is now per item_kind' AS status;
