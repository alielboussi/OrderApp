-- Formatting helpers and any small schema utilities
-- Idempotent: safe to run multiple times

CREATE OR REPLACE FUNCTION public.format_order_number(outlet_name text, seq bigint)
RETURNS text
LANGUAGE sql
SET search_path = pg_temp
STABLE
AS $$
  WITH safe AS (
    SELECT regexp_replace(trim(coalesce(outlet_name, 'Outlet')), '[^A-Za-z0-9_-]', '_', 'g') AS name
  )
  SELECT format('%s_%07d', name, seq) FROM safe;
$$;

-- ------------------------------------------------------------
-- Order workflow + signature pipeline enhancements (2025-11-24)
-- ------------------------------------------------------------

-- New metadata required for multi-stage signing.
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS employee_signed_name text,
  ADD COLUMN IF NOT EXISTS employee_signature_path text,
  ADD COLUMN IF NOT EXISTS employee_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS supervisor_signed_name text,
  ADD COLUMN IF NOT EXISTS supervisor_signature_path text,
  ADD COLUMN IF NOT EXISTS supervisor_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS driver_signed_name text,
  ADD COLUMN IF NOT EXISTS driver_signature_path text,
  ADD COLUMN IF NOT EXISTS driver_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS offloader_signed_name text,
  ADD COLUMN IF NOT EXISTS offloader_signature_path text,
  ADD COLUMN IF NOT EXISTS offloader_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS approved_pdf_path text,
  ADD COLUMN IF NOT EXISTS loaded_pdf_path text,
  ADD COLUMN IF NOT EXISTS offloaded_pdf_path text;

-- Ensure future inserts default to the new workflow vocabulary.
ALTER TABLE IF EXISTS public.orders
  ALTER COLUMN status SET DEFAULT 'Placed';

-- Normalize any lingering legacy values so downstream filters behave.
UPDATE public.orders SET status = 'Placed'
WHERE lower(status) IN ('order placed', 'placed')
  AND status <> 'Placed';

-- Expanded place_order RPC: captures employee signature metadata + pdf path.
DROP FUNCTION IF EXISTS public.place_order(uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.place_order(
    p_outlet_id uuid,
    p_items jsonb,
    p_employee_name text,
    p_signature_path text DEFAULT NULL,
    p_pdf_path text DEFAULT NULL
)
RETURNS TABLE(order_id uuid, order_number text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seq bigint;
  v_order_id uuid;
  v_order_number text;
  v_created_at timestamptz;
  v_employee_name text := nullif(btrim(coalesce(p_employee_name, '')), '');
  v_sig_path text := nullif(btrim(p_signature_path), '');
  v_pdf_path text := nullif(btrim(p_pdf_path), '');
BEGIN
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'p_outlet_id is required';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items must be a non-empty JSON array';
  END IF;

  INSERT INTO public.outlet_sequences AS os (outlet_id, next_seq)
  VALUES (p_outlet_id, 1)
  ON CONFLICT (outlet_id)
  DO UPDATE SET next_seq = os.next_seq + 1
  RETURNING os.next_seq INTO v_seq;

  v_order_number := lpad(v_seq::text, 6, '0');

  INSERT INTO public.orders (
    outlet_id,
    order_number,
    status,
    tz,
    created_at,
    employee_signed_name,
    employee_signature_path,
    employee_signed_at,
    pdf_path
  )
  VALUES (
    p_outlet_id,
    v_order_number,
    'Placed',
    coalesce(current_setting('TIMEZONE', true), 'UTC'),
    now(),
    v_employee_name,
    v_sig_path,
    CASE WHEN v_employee_name IS NOT NULL OR v_sig_path IS NOT NULL THEN now() ELSE NULL END,
    v_pdf_path
  )
  RETURNING id, order_number, created_at
  INTO v_order_id, v_order_number, v_created_at;

  INSERT INTO public.order_items (
    order_id, product_id, variation_id, name, uom, cost, qty, amount
  )
  SELECT
    v_order_id,
    i.product_id,
    i.variation_id,
    i.name,
    i.uom,
    i.cost,
    i.qty,
    coalesce(i.cost, 0)::numeric * coalesce(i.qty, 0)::numeric
  FROM jsonb_to_recordset(p_items) AS i(
    product_id uuid,
    variation_id uuid,
    name text,
    uom text,
    cost numeric,
    qty numeric
  );

  RETURN QUERY SELECT v_order_id, v_order_number, v_created_at;
END;
$$;

-- Supervisors: approve, lock, and attach signature/pdf metadata.
CREATE OR REPLACE FUNCTION public.supervisor_approve_order(
    p_order_id uuid,
    p_supervisor_name text DEFAULT NULL,
    p_signature_path text DEFAULT NULL,
    p_pdf_path text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_name text := nullif(btrim(coalesce(p_supervisor_name,
                     (current_setting('request.jwt.claims', true)::jsonb ->> 'name'))), '');
  v_sig text := nullif(btrim(p_signature_path), '');
  v_pdf text := nullif(btrim(p_pdf_path), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF NOT (public.is_admin(v_uid) OR public.has_role(v_uid, 'supervisor', v_order.outlet_id)) THEN
    RAISE EXCEPTION 'not authorized to approve this order';
  END IF;

  UPDATE public.orders o
     SET status = CASE
           WHEN lower(coalesce(o.status, '')) IN ('loaded', 'offloaded') THEN o.status
           ELSE 'Approved'
         END,
         locked = true,
         approved_at = coalesce(o.approved_at, now()),
         approved_by = coalesce(o.approved_by, v_uid),
         supervisor_signed_name = coalesce(v_name, o.supervisor_signed_name),
         supervisor_signature_path = coalesce(v_sig, o.supervisor_signature_path),
         supervisor_signed_at = CASE
             WHEN (v_name IS NOT NULL OR v_sig IS NOT NULL) THEN coalesce(o.supervisor_signed_at, now())
             ELSE o.supervisor_signed_at
         END,
         pdf_path = coalesce(v_pdf, o.pdf_path),
         approved_pdf_path = coalesce(v_pdf, o.approved_pdf_path)
   WHERE o.id = p_order_id
   RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

-- Supervisors: capture driver handoff + mark as loaded.
CREATE OR REPLACE FUNCTION public.mark_order_loaded(
    p_order_id uuid,
    p_driver_name text,
    p_signature_path text DEFAULT NULL,
    p_pdf_path text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_name text := nullif(btrim(p_driver_name), '');
  v_sig text := nullif(btrim(p_signature_path), '');
  v_pdf text := nullif(btrim(p_pdf_path), '');
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF NOT (public.is_admin(v_uid) OR public.has_role(v_uid, 'supervisor', v_order.outlet_id)) THEN
    RAISE EXCEPTION 'not authorized to mark this order as loaded';
  END IF;

  v_status := lower(coalesce(v_order.status, ''));
  IF v_status NOT IN ('approved', 'loaded', 'offloaded') THEN
    RAISE EXCEPTION 'order % must be approved before loading', p_order_id;
  END IF;

  UPDATE public.orders o
     SET status = CASE
           WHEN lower(coalesce(o.status, '')) = 'offloaded' THEN o.status
           ELSE 'Loaded'
         END,
         locked = true,
         driver_signed_name = coalesce(v_name, o.driver_signed_name),
         driver_signature_path = coalesce(v_sig, o.driver_signature_path),
         driver_signed_at = CASE
             WHEN (v_name IS NOT NULL OR v_sig IS NOT NULL) THEN coalesce(o.driver_signed_at, now())
             ELSE o.driver_signed_at
         END,
         pdf_path = coalesce(v_pdf, o.pdf_path),
         loaded_pdf_path = coalesce(v_pdf, o.loaded_pdf_path)
   WHERE o.id = p_order_id
   RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

-- Outlet/offloader step: capture receiving signature + final status.
CREATE OR REPLACE FUNCTION public.mark_order_offloaded(
    p_order_id uuid,
    p_offloader_name text,
    p_signature_path text DEFAULT NULL,
    p_pdf_path text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_name text := nullif(btrim(p_offloader_name), '');
  v_sig text := nullif(btrim(p_signature_path), '');
  v_pdf text := nullif(btrim(p_pdf_path), '');
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF NOT (public.is_admin(v_uid)
          OR public.has_role(v_uid, 'supervisor', v_order.outlet_id)
          OR public.order_is_accessible(p_order_id, v_uid)) THEN
    RAISE EXCEPTION 'not authorized to offload this order';
  END IF;

  v_status := lower(coalesce(v_order.status, ''));
  IF v_status NOT IN ('loaded', 'offloaded') THEN
    RAISE EXCEPTION 'order % must be loaded before offloading', p_order_id;
  END IF;

  UPDATE public.orders o
     SET status = 'Offloaded',
         locked = true,
         offloader_signed_name = coalesce(v_name, o.offloader_signed_name),
         offloader_signature_path = coalesce(v_sig, o.offloader_signature_path),
         offloader_signed_at = CASE
             WHEN (v_name IS NOT NULL OR v_sig IS NOT NULL) THEN coalesce(o.offloader_signed_at, now())
             ELSE o.offloader_signed_at
         END,
         pdf_path = coalesce(v_pdf, o.pdf_path),
         offloaded_pdf_path = coalesce(v_pdf, o.offloaded_pdf_path)
   WHERE o.id = p_order_id
   RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

-- ------------------------------------------------------------
-- Pack configuration + warehouse stocktake extensions (2025-11-24)
-- ------------------------------------------------------------

-- Ensure products/variations can declare preferred source warehouse.
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS default_warehouse_id uuid REFERENCES public.warehouses(id);

ALTER TABLE IF EXISTS public.product_variations
  ADD COLUMN IF NOT EXISTS default_warehouse_id uuid REFERENCES public.warehouses(id);

-- Configuration table describing how many base units live inside each pack per location.
CREATE TABLE IF NOT EXISTS public.product_pack_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id),
  variation_id uuid REFERENCES public.product_variations(id),
  location_id uuid REFERENCES public.outlets(id),
  pack_label text NOT NULL,
  units_per_pack numeric NOT NULL CHECK (units_per_pack > 0),
  active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_pack_configs_target_chk CHECK (product_id IS NOT NULL OR variation_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_pack_configs_scope
ON public.product_pack_configs (
  coalesce(product_id, variation_id),
  coalesce(variation_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
  pack_label,
  effective_from
);

-- Holds pack -> base unit expansion rows per order item.
CREATE TABLE IF NOT EXISTS public.order_pack_expansions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.outlets(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  variation_id uuid REFERENCES public.product_variations(id),
  pack_config_id uuid REFERENCES public.product_pack_configs(id),
  pack_label text NOT NULL,
  packs_ordered numeric NOT NULL,
  units_per_pack numeric NOT NULL,
  units_total numeric NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_order_pack_expansions_item
ON public.order_pack_expansions(order_item_id);

ALTER TABLE public.product_pack_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_pack_expansions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_pack_configs_select ON public.product_pack_configs;
CREATE POLICY product_pack_configs_select ON public.product_pack_configs
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR location_id IS NULL
    OR location_id = ANY(public.member_outlet_ids(auth.uid()))
  );

DROP POLICY IF EXISTS product_pack_configs_admin_rw ON public.product_pack_configs;
CREATE POLICY product_pack_configs_admin_rw ON public.product_pack_configs
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS order_pack_expansions_select ON public.order_pack_expansions;
CREATE POLICY order_pack_expansions_select ON public.order_pack_expansions
  FOR SELECT
  USING (public.order_is_accessible(order_id, auth.uid()));

-- Helper to compute expansion rows for a given order (idempotent).
CREATE OR REPLACE FUNCTION public.refresh_order_pack_expansions(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_outlet uuid;
  v_primary uuid;
  v_row record;
  v_cfg record;
  v_pack_label text;
  v_units numeric;
  v_wh uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  v_outlet := v_order.outlet_id;
  SELECT warehouse_id INTO v_primary FROM public.outlet_primary_warehouse WHERE outlet_id = v_outlet;

  DELETE FROM public.order_pack_expansions WHERE order_id = p_order_id;

  FOR v_row IN
    SELECT oi.* FROM public.order_items oi WHERE oi.order_id = p_order_id
  LOOP
    SELECT cfg.*
      INTO v_cfg
      FROM public.product_pack_configs cfg
     WHERE cfg.active
       AND (cfg.product_id = v_row.product_id OR cfg.variation_id = v_row.variation_id)
       AND (cfg.location_id = v_outlet OR cfg.location_id IS NULL)
       AND cfg.effective_from <= now()
       AND (cfg.effective_to IS NULL OR cfg.effective_to >= now())
     ORDER BY (cfg.location_id = v_outlet) DESC,
              (cfg.variation_id = v_row.variation_id) DESC,
              cfg.effective_from DESC
     LIMIT 1;

    v_pack_label := coalesce(v_cfg.pack_label, v_row.uom, 'Pack');
    v_units := coalesce(v_cfg.units_per_pack, 1) * coalesce(v_row.qty, 0);
    v_wh := coalesce(
      (SELECT pv.default_warehouse_id FROM public.product_variations pv WHERE pv.id = v_row.variation_id),
      (SELECT p.default_warehouse_id FROM public.products p WHERE p.id = v_row.product_id),
      v_primary
    );
    IF v_wh IS NULL THEN
      RAISE NOTICE 'No warehouse mapping for order_item %, defaulting to outlet primary', v_row.id;
      SELECT warehouse_id INTO v_wh FROM public.outlet_primary_warehouse WHERE outlet_id = v_outlet;
      IF v_wh IS NULL THEN
        RAISE EXCEPTION 'Warehouse mapping missing for order_item %', v_row.id;
      END IF;
    END IF;

    INSERT INTO public.order_pack_expansions (
      order_id,
      order_item_id,
      location_id,
      warehouse_id,
      product_id,
      variation_id,
      pack_config_id,
      pack_label,
      packs_ordered,
      units_per_pack,
      units_total
    ) VALUES (
      p_order_id,
      v_row.id,
      v_outlet,
      v_wh,
      v_row.product_id,
      v_row.variation_id,
      v_cfg.id,
      v_pack_label,
      coalesce(v_row.qty, 0),
      coalesce(v_cfg.units_per_pack, 1),
      v_units
    );
  END LOOP;
END;
$$;

-- View + RPC for pack consumption reporting.
CREATE OR REPLACE VIEW public.order_pack_consumption AS
SELECT
  ope.id,
  ope.order_id,
  o.order_number,
  o.outlet_id,
  outlets.name AS outlet_name,
  ope.warehouse_id,
  w.name AS warehouse_name,
  ope.product_id,
  p.name AS product_name,
  ope.variation_id,
  pv.name AS variation_name,
  ope.pack_label,
  ope.packs_ordered,
  ope.units_per_pack,
  ope.units_total,
  o.created_at,
  o.status
FROM public.order_pack_expansions ope
JOIN public.orders o ON o.id = ope.order_id
JOIN public.outlets ON outlets.id = o.outlet_id
JOIN public.warehouses w ON w.id = ope.warehouse_id
JOIN public.products p ON p.id = ope.product_id
LEFT JOIN public.product_variations pv ON pv.id = ope.variation_id;

CREATE OR REPLACE FUNCTION public.report_pack_consumption(
    p_from timestamptz,
    p_to timestamptz,
    p_location uuid DEFAULT NULL,
    p_warehouse uuid DEFAULT NULL
)
RETURNS SETOF public.order_pack_consumption
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.order_pack_consumption opc
  WHERE (p_from IS NULL OR opc.created_at >= p_from)
    AND (p_to IS NULL OR opc.created_at <= p_to)
    AND (p_location IS NULL OR opc.outlet_id = p_location)
    AND (p_warehouse IS NULL OR opc.warehouse_id = p_warehouse)
    AND (
      public.is_admin(auth.uid())
      OR opc.outlet_id = ANY(public.member_outlet_ids(auth.uid()))
    );
$$;

-- Allow stocktake adjustments via ledger.
ALTER TYPE public.stock_reason ADD VALUE IF NOT EXISTS 'stocktake_adjustment';

CREATE TABLE IF NOT EXISTS public.warehouse_stocktakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  variation_id uuid REFERENCES public.product_variations(id),
  counted_qty numeric NOT NULL,
  delta numeric NOT NULL,
  note text,
  recorded_by uuid NOT NULL DEFAULT auth.uid(),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouse_stocktakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS warehouse_stocktakes_select ON public.warehouse_stocktakes;
CREATE POLICY warehouse_stocktakes_select ON public.warehouse_stocktakes
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR public.has_role_any_outlet(auth.uid(), 'transfer_manager')
  );

DROP POLICY IF EXISTS warehouse_stocktakes_admin_rw ON public.warehouse_stocktakes;
CREATE POLICY warehouse_stocktakes_admin_rw ON public.warehouse_stocktakes
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.record_stocktake(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_counted_qty numeric,
  p_variation_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.warehouse_stocktakes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current numeric := 0;
  v_delta numeric := 0;
  v_row public.warehouse_stocktakes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT coalesce(qty, 0)
    INTO v_current
    FROM public.warehouse_stock_current
   WHERE warehouse_id = p_warehouse_id
     AND product_id = p_product_id
     AND (variation_id IS NOT DISTINCT FROM p_variation_id);

  v_delta := coalesce(p_counted_qty, 0) - v_current;

  INSERT INTO public.warehouse_stocktakes (
    warehouse_id,
    product_id,
    variation_id,
    counted_qty,
    delta,
    note,
    recorded_by
  ) VALUES (
    p_warehouse_id,
    p_product_id,
    p_variation_id,
    coalesce(p_counted_qty, 0),
    v_delta,
    p_note,
    v_uid
  ) RETURNING * INTO v_row;

  IF v_delta <> 0 THEN
    INSERT INTO public.stock_ledger(
      location_type,
      location_id,
      product_id,
      variation_id,
      qty_change,
      reason,
      ref_order_id,
      note
    ) VALUES (
      'warehouse',
      p_warehouse_id,
      p_product_id,
      p_variation_id,
      v_delta,
      'stocktake_adjustment',
      NULL,
      p_note
    );
  END IF;

  RETURN v_row;
END;
$$;

-- Recreate supervisor approval to refresh pack expansions after signing.
CREATE OR REPLACE FUNCTION public.supervisor_approve_order(
    p_order_id uuid,
    p_supervisor_name text DEFAULT NULL,
    p_signature_path text DEFAULT NULL,
    p_pdf_path text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_name text := nullif(btrim(coalesce(p_supervisor_name,
                     (current_setting('request.jwt.claims', true)::jsonb ->> 'name'))), '');
  v_sig text := nullif(btrim(p_signature_path), '');
  v_pdf text := nullif(btrim(p_pdf_path), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF NOT (public.is_admin(v_uid) OR public.has_role(v_uid, 'supervisor', v_order.outlet_id)) THEN
    RAISE EXCEPTION 'not authorized to approve this order';
  END IF;

  UPDATE public.orders o
     SET status = CASE
           WHEN lower(coalesce(o.status, '')) IN ('loaded', 'offloaded') THEN o.status
           ELSE 'Approved'
         END,
         locked = true,
         approved_at = coalesce(o.approved_at, now()),
         approved_by = coalesce(o.approved_by, v_uid),
         supervisor_signed_name = coalesce(v_name, o.supervisor_signed_name),
         supervisor_signature_path = coalesce(v_sig, o.supervisor_signature_path),
         supervisor_signed_at = CASE
             WHEN (v_name IS NOT NULL OR v_sig IS NOT NULL) THEN coalesce(o.supervisor_signed_at, now())
             ELSE o.supervisor_signed_at
         END,
         pdf_path = coalesce(v_pdf, o.pdf_path),
         approved_pdf_path = coalesce(v_pdf, o.approved_pdf_path)
   WHERE o.id = p_order_id
   RETURNING * INTO v_order;

  PERFORM public.refresh_order_pack_expansions(p_order_id);

  RETURN v_order;
END;
$$;