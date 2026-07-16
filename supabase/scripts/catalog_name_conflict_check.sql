-- Check catalog name index (run in Supabase SQL Editor)
-- PASS after fix: indexname = idx_catalog_items_name_item_kind_unique
-- FAIL (old rule):  indexname = idx_catalog_items_name_unique only

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'catalog_items'
  AND indexname LIKE '%name%';

-- Find all catalog rows matching a product name (replace YOUR_PRODUCT_NAME)
SELECT id, name, item_kind, sku, active
FROM public.catalog_items
WHERE lower(trim(name)) = lower(trim('YOUR_PRODUCT_NAME'))
ORDER BY item_kind, name;
