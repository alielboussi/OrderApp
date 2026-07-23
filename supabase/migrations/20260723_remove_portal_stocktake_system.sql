-- Remove portal stocktake / fulfillment-recipe system and outlet live balances.
-- Portal now handles orders + POS sales only; stocktaking and live balance tracking
-- are handled separately. Safe to re-run (IF EXISTS / CREATE OR REPLACE).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop dependent view
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_outlet_warehouses;

-- ---------------------------------------------------------------------------
-- 2. Detach order receipts from stock periods before dropping period tables
-- ---------------------------------------------------------------------------
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'outlet_warehouse_order_receipts'
      AND column_name = 'stock_period_id'
  ) THEN
    UPDATE public.outlet_warehouse_order_receipts
    SET stock_period_id = NULL
    WHERE stock_period_id IS NOT NULL;
  END IF;
END;
$block$;

-- ---------------------------------------------------------------------------
-- 3. Drop stocktake / deduction tables
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.outlet_warehouse_period_variances CASCADE;
DROP TABLE IF EXISTS public.outlet_warehouse_period_summaries CASCADE;
DROP TABLE IF EXISTS public.outlet_pos_deduction_rules CASCADE;
DROP TABLE IF EXISTS public.outlet_order_yield_rules CASCADE;
DROP TABLE IF EXISTS public.warehouse_stock_counts CASCADE;
DROP TABLE IF EXISTS public.warehouse_stock_periods CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Drop stocktake-specific columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.outlet_warehouses DROP COLUMN IF EXISTS show_in_stocktake;
ALTER TABLE public.outlet_catalog_allowlist DROP COLUMN IF EXISTS allow_stocktake;
ALTER TABLE public.warehouses DROP COLUMN IF EXISTS auto_open_stock_period;
ALTER TABLE public.catalog_items DROP COLUMN IF EXISTS stocktake_uom;
ALTER TABLE public.catalog_variants DROP COLUMN IF EXISTS stocktake_uom;
ALTER TABLE public.outlet_warehouse_order_receipts DROP COLUMN IF EXISTS stock_period_id;

-- ---------------------------------------------------------------------------
-- 5. Recreate outlet warehouse view (without show_in_stocktake)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_outlet_warehouses AS
SELECT
  o.id AS outlet_id,
  o.name AS outlet_name,
  o.code AS outlet_code,
  w.id AS warehouse_id,
  w.name AS warehouse_name,
  w.warehouse_scope
FROM public.outlets o
JOIN public.outlet_warehouses ow ON ow.outlet_id = o.id
JOIN public.warehouses w ON w.id = ow.warehouse_id
WHERE COALESCE(o.active, true)
  AND COALESCE(w.active, true);

-- ---------------------------------------------------------------------------
-- 6. Replace stock-period gates with no-ops (orders + transfers keep working)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_open_stock_period_for_outlet_warehouse(p_warehouse_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_open_stock_period(p_warehouse_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_open_warehouse_period(p_warehouse_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT true;
$$;

-- POS sales upload no longer gated by stocktake open/close window.
CREATE OR REPLACE FUNCTION public.outlet_pos_sale_in_sync_window(
  p_outlet_id uuid,
  p_sold_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT true;
$$;

-- Fulfillment recipe deductions removed.
CREATE OR REPLACE FUNCTION public.apply_pos_sale_deduction_rules(
  p_outlet_id uuid,
  p_sold_item_id uuid,
  p_sold_variant_key text,
  p_sale_qty numeric,
  p_sold_at timestamptz DEFAULT now(),
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_order_yield_from_deduction_rules(p_outlet_id uuid, p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lines jsonb;
BEGIN
  IF p_outlet_id IS NULL OR p_order_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', oi.product_id,
        'variant_key', public.normalize_variant_key(oi.variation_key),
        'qty', oi.qty,
        'cost', oi.cost,
        'amount', oi.amount
      )
      ORDER BY oi.created_at
    ),
    '[]'::jsonb
  )
  INTO v_lines
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  RETURN v_lines;
END;
$function$;

-- Order receipts: no stock period, yield from order lines directly.
CREATE OR REPLACE FUNCTION public.record_outlet_warehouse_order_receipt(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%rowtype;
  v_outlet record;
  v_warehouse_id uuid;
  v_receipt_id uuid;
  v_line_count integer := 0;
  v_total_units numeric := 0;
  v_total_value numeric := 0;
  v_order_lines jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  SELECT o.id, o.uses_orders_app, o.default_receiving_warehouse_id
  INTO v_outlet
  FROM public.outlets o
  WHERE o.id = v_order.outlet_id;

  IF NOT COALESCE(v_outlet.uses_orders_app, false) THEN
    RETURN NULL;
  END IF;

  v_warehouse_id := v_outlet.default_receiving_warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT ow.warehouse_id
    INTO v_warehouse_id
    FROM public.outlet_warehouses ow
    WHERE ow.outlet_id = v_outlet.id
    ORDER BY ow.warehouse_id
    LIMIT 1;
  END IF;

  IF v_warehouse_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)::integer,
         COALESCE(SUM(oi.qty), 0),
         COALESCE(SUM(COALESCE(oi.amount, oi.qty * oi.cost, 0)), 0)
  INTO v_line_count, v_total_units, v_total_value
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', oi.product_id,
        'variant_key', public.normalize_variant_key(oi.variation_key),
        'qty', oi.qty,
        'cost', oi.cost,
        'amount', oi.amount
      )
      ORDER BY oi.created_at
    ),
    '[]'::jsonb
  )
  INTO v_order_lines
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  INSERT INTO public.outlet_warehouse_order_receipts (
    outlet_id,
    warehouse_id,
    order_id,
    approved_at,
    line_count,
    total_units,
    total_value,
    metadata
  )
  VALUES (
    v_order.outlet_id,
    v_warehouse_id,
    p_order_id,
    now(),
    v_line_count,
    v_total_units,
    v_total_value,
    jsonb_build_object('order_lines', v_order_lines, 'source', 'order_items')
  )
  ON CONFLICT (order_id, warehouse_id) DO UPDATE SET
    line_count = EXCLUDED.line_count,
    total_units = EXCLUDED.total_units,
    total_value = EXCLUDED.total_value,
    metadata = EXCLUDED.metadata,
    approved_at = EXCLUDED.approved_at
  RETURNING id INTO v_receipt_id;

  RETURN v_receipt_id;
END;
$function$;

-- POS validation: mapping only — no open stock period requirement.
CREATE OR REPLACE FUNCTION public.validate_pos_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_outlet uuid := nullif(payload->>'outlet_id', '')::uuid;
  v_source text := nullif(payload->>'source_event_id', '');
  v_item jsonb;
  v_resolved record;
  v_qty numeric;
  v_qty_text text;
  v_errors jsonb := '[]'::jsonb;
  v_has_mapped boolean := false;
  v_item_sku text;
  v_variant_sku text;
  v_pos_item_name text;
BEGIN
  IF v_outlet IS NULL THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'missing_outlet', 'message', 'outlet_id is required'));
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  IF v_source IS NULL THEN
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('code', 'missing_source', 'message', 'source_event_id is required'));
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'items', '[]'::jsonb))
  LOOP
    v_item_sku := nullif(trim(coalesce(v_item->>'item_sku', v_item->>'catalog_item_sku', '')), '');
    IF v_item_sku IS NULL THEN
      v_item_sku := nullif(trim(v_item->>'pos_item_id'), '');
    END IF;
    v_variant_sku := nullif(trim(coalesce(v_item->>'variant_sku', v_item->>'flavour_sku', '')), '');
    v_pos_item_name := nullif(trim(v_item->>'name'), '');
    IF v_item_sku IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_resolved
    FROM public.resolve_catalog_for_outlet(v_outlet, v_item_sku, v_variant_sku, v_pos_item_name)
    LIMIT 1;
    IF NOT FOUND OR v_resolved.catalog_item_id IS NULL THEN
      CONTINUE;
    END IF;

    v_qty_text := nullif(v_item->>'quantity', '');
    v_qty := COALESCE(v_qty_text::numeric, 0);
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    v_has_mapped := true;
    EXIT;
  END LOOP;

  IF NOT v_has_mapped THEN
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('code', 'no_mappable_items', 'message', 'no items had a valid catalog mapping')
    );
    RETURN jsonb_build_object('ok', false, 'errors', v_errors);
  END IF;

  RETURN jsonb_build_object('ok', true, 'errors', '[]'::jsonb);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Drop stocktake-only functions (no longer referenced after cleanup)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.can_operate_outlet_warehouse_stocktake(uuid, uuid);
DROP FUNCTION IF EXISTS public.list_outlet_stocktake_catalog(uuid);
DROP FUNCTION IF EXISTS public.next_stocktake_number();
DROP FUNCTION IF EXISTS public.stocktake_outlet_ids(uuid);
DROP FUNCTION IF EXISTS public.upsert_outlet_period_summary(uuid, uuid, uuid, text, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.set_stocktake_app_user_updated_at();
DROP FUNCTION IF EXISTS public.trg_set_stock_period_outlet_id();
DROP FUNCTION IF EXISTS public.sync_opening_stock_to_ledger();

-- These may exist in live DB even if absent from schema export.
DROP FUNCTION IF EXISTS public.start_stock_period(uuid, text);
DROP FUNCTION IF EXISTS public.start_stock_period(uuid);
DROP FUNCTION IF EXISTS public.close_stock_period(uuid);
DROP FUNCTION IF EXISTS public.record_stock_count(uuid, uuid, text, numeric, text);
DROP FUNCTION IF EXISTS public.record_stock_count(uuid, uuid, text, numeric);

-- ---------------------------------------------------------------------------
-- 8. Remove outlet live balance views, table, and fulfillment hooks
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_outlet_live_balances;
DROP VIEW IF EXISTS public.v_outlet_warehouse_ledger_balances;
DROP VIEW IF EXISTS public.outlet_stock_summary;

DROP TABLE IF EXISTS public.outlet_stock_balances CASCADE;

-- Drop any alternate signatures that may exist in live DBs.
DROP FUNCTION IF EXISTS public.record_outlet_sale(uuid, uuid, numeric, text, timestamptz, jsonb, boolean, uuid);
DROP FUNCTION IF EXISTS public.record_outlet_sale(uuid, uuid, numeric, text, timestamptz, jsonb);
DROP FUNCTION IF EXISTS public.record_outlet_sale(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.record_order_fulfillment(uuid);

-- Stub so accept_order and legacy RPC callers keep working without balance tracking.
CREATE OR REPLACE FUNCTION public.record_order_fulfillment(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_outlet_sale(
  p_outlet_id uuid,
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_key text DEFAULT 'base'::text,
  p_sold_at timestamptz DEFAULT now(),
  p_context jsonb DEFAULT '{}'::jsonb,
  p_is_production boolean DEFAULT false,
  p_warehouse_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN;
END;
$function$;

COMMIT;

SELECT 'portal stocktake and live balance systems removed' AS status;
