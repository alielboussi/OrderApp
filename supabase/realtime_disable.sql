-- Roll back the Realtime publication changes made by realtime_enable.sql
-- Safe/idempotent: removes listed tables from publication only if present.
-- Optional: will drop the publication if it becomes empty (toggle via the variable below).

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- Core orders
    'orders',
    'order_items',
    'order_item_allocations',
    -- Stock
    'stock_movements',
    'stock_movement_items',
    'stock_ledger',
    -- Catalog
    'products',
    'product_variations',
    -- Orgs/outlets
    'outlets',
    'outlet_users',
    'outlet_sequences',
    'warehouses',
    -- Misc app tables
    'assets'
  ];
  drop_empty_pub boolean := true;  -- set false to keep supabase_realtime publication even if empty
BEGIN
  -- If the publication doesn't exist, nothing to do
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publication supabase_realtime does not exist; skipping';
    RETURN;
  END IF;

  -- Remove each listed table from the publication if present
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I', 'public', t);
    END IF;
  END LOOP;

  -- Optionally drop the publication if it has no tables left
  IF drop_empty_pub AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
  ) THEN
    EXECUTE 'DROP PUBLICATION supabase_realtime';
  END IF;
END
$$;