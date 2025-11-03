-- Ensure Supabase Realtime is enabled for the tables the app subscribes to
-- Why: "Unable to subscribe to changes ... [schema: public, table: order_items]"
-- happens when the table is not part of the publication `supabase_realtime`.
-- Safe/idempotent: creates publication if missing and adds tables only if needed.

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
BEGIN
  -- Create publication if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    EXECUTE 'CREATE PUBLICATION supabase_realtime';
  END IF;

  -- Add each whitelisted public base table to the publication if it exists and isn't already included.
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind IN ('r','p')  -- ordinary table or partitioned table
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', 'public', t);
    END IF;
  END LOOP;

  -- Notes:
  -- - Realtime on views/materialized views is not supported; this script skips non-base tables.
  -- - Realtime on non-public schemas (e.g., auth, storage, realtime, vault) is not recommended
  --   in hosted Supabase and typically disabled; keep events limited to your application tables.
  -- - If any table lacks a primary key and you need UPDATE/DELETE old values, consider:
  --     ALTER TABLE public.<table> REPLICA IDENTITY FULL;
END
$$;