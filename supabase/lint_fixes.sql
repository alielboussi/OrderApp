-- Set flagged views to SECURITY INVOKER for safer execution context
-- Safe/idempotent: re-runnable; skips if views don't exist

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schemaname, c.relname AS viewname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'v'
      AND n.nspname = 'public'
      AND c.relname IN (
        'warehouse_group_stock_current',
        'warehouse_stock_current',
        'outlet_stock_current',
        'current_user_roles'
      )
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', r.schemaname, r.viewname);
  END LOOP;
END
$$;