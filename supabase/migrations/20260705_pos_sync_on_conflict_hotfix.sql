-- HOTFIX — run in Supabase SQL Editor if sync_pos_order fails with:
--   42P10 "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Cause: orders.source_event_id uses a PARTIAL unique index (WHERE NOT NULL), not a table
-- constraint — plain ON CONFLICT (source_event_id) is invalid.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.sync_pos_order(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_outlet uuid := nullif(payload->>'outlet_id', '')::uuid;
  v_source text := nullif(payload->>'source_event_id', '');
  v_order_id uuid;
  v_existing jsonb;
  v_merged jsonb;
  v_item jsonb;
  v_resolved record;
  v_qty numeric;
  v_qty_text text;
  v_branch integer := nullif(payload->>'branch_id', '')::integer;
  v_outlet_name text;
  v_item_sku text;
  v_variant_sku text;
  v_pos_item_name text;
  v_ctx jsonb;
  v_sold_at timestamptz;
  v_has_lines boolean;
BEGIN
  IF v_outlet IS NULL OR v_source IS NULL THEN
    RAISE EXCEPTION 'outlet_id and source_event_id are required';
  END IF;

  SELECT id, raw_payload INTO v_order_id, v_existing
  FROM public.orders
  WHERE source_event_id = v_source AND outlet_id = v_outlet
  FOR UPDATE;

  v_merged := COALESCE(v_existing, '{}'::jsonb);
  v_merged := v_merged || (payload - 'items');

  IF payload ? 'shift' AND payload->'shift' IS NOT NULL AND payload->'shift' <> 'null'::jsonb THEN
    v_merged := jsonb_set(v_merged, '{shift}', payload->'shift', true);
  END IF;

  IF v_order_id IS NULL THEN
    v_sold_at := COALESCE(nullif(payload->>'occurred_at', '')::timestamptz, now());
    SELECT name INTO v_outlet_name FROM public.outlets WHERE id = v_outlet;

    BEGIN
      INSERT INTO public.orders (
        outlet_id, source_event_id, pos_sale_id, status, locked, branch_id, pos_branch_id,
        order_type, bill_type, total_discount, total_discount_amount, total_gst,
        service_charges, delivery_charges, tip, pos_fee, price_type,
        customer_name, customer_phone, customer_email, raw_payload
      )
      VALUES (
        v_outlet, v_source, nullif(payload->>'sale_id', ''),
        'synced', true, v_branch, v_branch,
        payload->>'order_type', payload->>'bill_type',
        nullif(payload->>'total_discount', '')::numeric,
        nullif(payload->>'total_discount_amount', '')::numeric,
        nullif(payload->>'total_gst', '')::numeric,
        nullif(payload->>'service_charges', '')::numeric,
        nullif(payload->>'delivery_charges', '')::numeric,
        nullif(payload->>'tip', '')::numeric,
        nullif(payload->>'pos_fee', '')::numeric,
        payload->>'price_type',
        payload->'customer'->>'name',
        payload->'customer'->>'phone',
        payload->'customer'->>'email',
        v_merged
      )
      RETURNING id INTO v_order_id;
    EXCEPTION
      WHEN unique_violation THEN
        UPDATE public.orders
        SET raw_payload = v_merged,
            updated_at = now()
        WHERE source_event_id = v_source AND outlet_id = v_outlet
        RETURNING id INTO v_order_id;
    END;
  ELSE
    UPDATE public.orders
    SET raw_payload = v_merged,
        updated_at = now()
    WHERE id = v_order_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.outlet_sales os
    WHERE os.outlet_id = v_outlet
      AND os.context->>'source_event_id' = v_source
    LIMIT 1
  ) INTO v_has_lines;

  IF v_has_lines THEN
    RETURN;
  END IF;

  IF v_order_id IS NULL THEN
    SELECT id INTO v_order_id FROM public.orders WHERE source_event_id = v_source AND outlet_id = v_outlet;
  END IF;

  v_sold_at := COALESCE(nullif(payload->>'occurred_at', '')::timestamptz, now());
  SELECT name INTO v_outlet_name FROM public.outlets WHERE id = v_outlet;

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

    v_ctx := jsonb_build_object(
      'outlet_name', v_outlet_name,
      'outlet_id', v_outlet,
      'catalog_item_id', v_resolved.catalog_item_id,
      'catalog_item_name', v_resolved.catalog_item_name,
      'catalog_item_sku', v_resolved.catalog_item_sku,
      'variant_key', v_resolved.variant_key,
      'variant_name', v_resolved.variant_name,
      'variant_sku', v_resolved.variant_sku,
      'pos_item_id', v_item->>'pos_item_id',
      'source_event_id', v_source,
      'sale_id', payload->>'sale_id',
      'order_id', v_order_id
    );

    INSERT INTO public.outlet_sales (
      outlet_id, item_id, qty_units, variant_key, sold_at, sale_price,
      vat_exc_price, flavour_price, flavour_id, context
    )
    VALUES (
      v_outlet, v_resolved.catalog_item_id, v_qty, v_resolved.variant_key, v_sold_at,
      nullif(v_item->>'sale_price', '')::numeric,
      nullif(v_item->>'vat_exc_price', '')::numeric,
      nullif(v_item->>'flavour_price', '')::numeric,
      v_item->>'flavour_id',
      v_ctx
    );
  END LOOP;
END;
$function$;

SELECT 'sync_pos_order hotfix applied' AS status;
