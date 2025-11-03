-- Optional performance indexes for common queries
-- Safe/idempotent: only creates if table exists and index not present

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_outlet_created ON public.orders (outlet_id, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_outlet_status_created ON public.orders (outlet_id, status, created_at DESC)';
  END IF;

  IF to_regclass('public.order_items') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id)';
  END IF;
END
$$;