-- Run in Supabase SQL editor.
-- Auto-binds POS SKUs to outlet_products + outlet_item_routes when middleware syncs catalog.
-- Skips outlets with uses_orders_app = false (Till 1, Till 2, Quick Corner, etc.).

CREATE OR REPLACE FUNCTION public.sync_outlet_pos_catalog_bindings(
  p_outlet_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uses_app boolean := false;
  v_sales_wh uuid;
  v_products int := 0;
  v_routes int := 0;
BEGIN
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'outlet_id required';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'empty_rows');
  END IF;

  SELECT
    COALESCE(o.uses_orders_app, false),
    o.default_sales_warehouse_id
  INTO v_uses_app, v_sales_wh
  FROM public.outlets o
  WHERE o.id = p_outlet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outlet % not found', p_outlet_id;
  END IF;

  -- POS-only outlets: sync catalog names via sync_pos_catalog_from_middleware only.
  -- Do not auto-bind ordering routes or deduct-from-warehouse on approved app orders.
  IF NOT v_uses_app OR v_sales_wh IS NULL THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'uses_orders_app', v_uses_app,
      'has_sales_warehouse', v_sales_wh IS NOT NULL
    );
  END IF;

  WITH src AS (
    SELECT DISTINCT
      NULLIF(TRIM(r.item_sku), '') AS item_sku,
      NULLIF(TRIM(r.variant_sku), '') AS variant_sku
    FROM jsonb_to_recordset(p_rows) AS r(
      item_sku text,
      item_name text,
      variant_name text,
      variant_sku text
    )
    WHERE NULLIF(TRIM(r.item_sku), '') IS NOT NULL
  ),
  resolved AS (
    SELECT DISTINCT
      m.catalog_item_id AS item_id,
      public.normalize_variant_key(COALESCE(NULLIF(TRIM(m.variant_key), ''), 'base')) AS variant_key
    FROM src s
    CROSS JOIN LATERAL public.resolve_catalog_by_sku(s.item_sku, s.variant_sku) m
    WHERE m.catalog_item_id IS NOT NULL
  ),
  product_upserts AS (
    INSERT INTO public.outlet_products (outlet_id, item_id, variant_key, enabled)
    SELECT p_outlet_id, item_id, variant_key, true
    FROM resolved
    ON CONFLICT (outlet_id, item_id, variant_key)
    DO UPDATE SET enabled = EXCLUDED.enabled
    RETURNING 1
  ),
  route_upserts AS (
    INSERT INTO public.outlet_item_routes (
      outlet_id,
      item_id,
      warehouse_id,
      variant_key,
      normalized_variant_key,
      deduct_enabled
    )
    SELECT
      p_outlet_id,
      item_id,
      v_sales_wh,
      variant_key,
      variant_key,
      true
    FROM resolved
    ON CONFLICT (outlet_id, item_id, normalized_variant_key)
    DO UPDATE SET
      warehouse_id = EXCLUDED.warehouse_id,
      variant_key = EXCLUDED.variant_key,
      deduct_enabled = true
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*)::int FROM product_upserts),
    (SELECT COUNT(*)::int FROM route_upserts)
  INTO v_products, v_routes;

  RETURN jsonb_build_object(
    'ok', true,
    'uses_orders_app', true,
    'warehouse_id', v_sales_wh,
    'outlet_products_upserted', v_products,
    'outlet_routes_upserted', v_routes
  );
END;
$$;
