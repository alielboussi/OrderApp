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

-- Ensure deprecated outlet login metadata is removed now that outlet_users controls mapping.
ALTER TABLE IF EXISTS public.outlets
  DROP COLUMN IF EXISTS email;

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
  v_primary_wh uuid;
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

  SELECT warehouse_id INTO v_primary_wh
  FROM public.outlet_primary_warehouse
  WHERE outlet_id = p_outlet_id;

  WITH payload AS (
    SELECT
      i.product_id,
      i.variation_id,
      i.name,
      i.uom,
      i.cost,
      coalesce(i.qty_cases, i.qty, 0)::numeric AS qty_cases,
      i.warehouse_id AS warehouse_override
    FROM jsonb_to_recordset(p_items) AS i(
      product_id uuid,
      variation_id uuid,
      name text,
      uom text,
      cost numeric,
      qty numeric,
      qty_cases numeric,
      warehouse_id uuid
    )
  )
  INSERT INTO public.order_items (
    order_id,
    product_id,
    variation_id,
    name,
    uom,
    cost,
    qty_cases,
    units_per_uom,
    qty,
    amount,
    warehouse_id
  )
  SELECT
    v_order_id,
    p_item.product_id,
    p_item.variation_id,
    p_item.name,
    p_item.uom,
    p_item.cost,
    p_item.qty_cases,
    coalesce(pv.units_per_uom, prod.units_per_uom, 1) AS units_per_uom,
    p_item.qty_cases * coalesce(pv.units_per_uom, prod.units_per_uom, 1) AS qty_units,
    coalesce(p_item.cost, 0)::numeric * (p_item.qty_cases * coalesce(pv.units_per_uom, prod.units_per_uom, 1)) AS amount,
    coalesce(p_item.warehouse_override, pv.default_warehouse_id, prod.default_warehouse_id, v_primary_wh)
  FROM payload p_item
  LEFT JOIN public.products prod ON prod.id = p_item.product_id
  LEFT JOIN public.product_variations pv ON pv.id = p_item.variation_id;

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
-- Branch + standardized case sizing (2025-11-25)
-- ------------------------------------------------------------

-- Ensure products/variations can declare preferred source warehouse.
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS default_warehouse_id uuid REFERENCES public.warehouses(id);

ALTER TABLE IF EXISTS public.product_variations
  ADD COLUMN IF NOT EXISTS default_warehouse_id uuid REFERENCES public.warehouses(id);

ALTER TABLE IF EXISTS public.warehouses
  DROP COLUMN IF EXISTS branch_id,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'child_coldroom'
    CHECK (kind IN ('main_coldroom','child_coldroom','selling_depot','outlet_warehouse'));

DROP TABLE IF EXISTS public.branches;

DO $$
BEGIN
  UPDATE public.warehouses
  SET kind = CASE
    WHEN parent_warehouse_id IS NULL THEN 'main_coldroom'
    ELSE coalesce(kind, 'child_coldroom')
  END
  WHERE kind IS NULL OR (parent_warehouse_id IS NULL AND kind <> 'main_coldroom');
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'case_size_units'
  ) THEN
    ALTER TABLE public.products RENAME COLUMN case_size_units TO units_per_uom;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variations' AND column_name = 'case_size_units'
  ) THEN
    ALTER TABLE public.product_variations RENAME COLUMN case_size_units TO units_per_uom;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'case_size_units'
  ) THEN
    ALTER TABLE public.order_items RENAME COLUMN case_size_units TO units_per_uom;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS units_per_uom numeric NOT NULL DEFAULT 1 CHECK (units_per_uom > 0);

-- ------------------------------------------------------------
-- Stock entry logging + warehouse transfer portal (2025-11-27)
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'stock_entry_kind'
  ) THEN
    CREATE TYPE public.stock_entry_kind AS ENUM ('initial','purchase','closing');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.warehouse_stock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id uuid REFERENCES public.product_variations(id) ON DELETE SET NULL,
  entry_kind public.stock_entry_kind NOT NULL,
  qty numeric NOT NULL CHECK (qty > 0),
  note text,
  recorded_by uuid NOT NULL DEFAULT auth.uid(),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wse_warehouse ON public.warehouse_stock_entries(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wse_product ON public.warehouse_stock_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_wse_variation ON public.warehouse_stock_entries(variation_id);

ALTER TABLE public.warehouse_stock_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wse_select_admin ON public.warehouse_stock_entries;
CREATE POLICY wse_select_admin
  ON public.warehouse_stock_entries
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR public.has_role_any_outlet(auth.uid(), 'transfer_manager')
  );

DROP POLICY IF EXISTS wse_write_admin ON public.warehouse_stock_entries;
CREATE POLICY wse_write_admin
  ON public.warehouse_stock_entries
  FOR INSERT
  WITH CHECK (
    recorded_by = auth.uid()
    AND (
      public.is_admin(auth.uid())
      OR public.has_role_any_outlet(auth.uid(), 'transfer_manager')
    )
  );

DROP POLICY IF EXISTS wse_update_admin ON public.warehouse_stock_entries;
CREATE POLICY wse_update_admin
  ON public.warehouse_stock_entries
  FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.record_stock_entry(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_entry_kind public.stock_entry_kind,
  p_units numeric,
  p_variation_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.warehouse_stock_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry public.warehouse_stock_entries%ROWTYPE;
  v_current numeric := 0;
  v_target numeric := p_units;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (
    public.is_admin(v_uid)
    OR public.has_role_any_outlet(v_uid, 'transfer_manager')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_units IS NULL OR p_units <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive';
  END IF;

  INSERT INTO public.warehouse_stock_entries(
    warehouse_id,
    product_id,
    variation_id,
    entry_kind,
    qty,
    note,
    recorded_by
  ) VALUES (
    p_warehouse_id,
    p_product_id,
    p_variation_id,
    p_entry_kind,
    p_units,
    p_note,
    v_uid
  ) RETURNING * INTO v_entry;

  IF p_entry_kind = 'purchase' THEN
    SELECT coalesce(qty, 0)
      INTO v_current
      FROM public.warehouse_stock_current
     WHERE warehouse_id = p_warehouse_id
       AND product_id = p_product_id
       AND (variation_id IS NOT DISTINCT FROM p_variation_id);
    v_target := v_current + p_units;
  ELSE
    v_target := p_units;
  END IF;

  PERFORM public.record_stocktake(
    p_warehouse_id,
    p_product_id,
    v_target,
    p_variation_id,
    coalesce(p_note, p_entry_kind::text)
  );

  RETURN v_entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_stock_entry_balances(
    p_warehouse_id uuid DEFAULT NULL,
    p_product_id uuid DEFAULT NULL,
    p_variation_id uuid DEFAULT NULL,
    p_search text DEFAULT NULL
)
RETURNS TABLE(
    warehouse_id uuid,
    warehouse_name text,
    product_id uuid,
    product_name text,
    variation_id uuid,
    variation_name text,
    initial_qty numeric,
    purchase_qty numeric,
    closing_qty numeric,
    current_stock numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_query text := coalesce(p_search, '');
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    e.warehouse_id,
    w.name AS warehouse_name,
    e.product_id,
    p.name AS product_name,
    e.variation_id,
    pv.name AS variation_name,
    SUM(CASE WHEN e.entry_kind = 'initial' THEN e.qty ELSE 0 END) AS initial_qty,
    SUM(CASE WHEN e.entry_kind = 'purchase' THEN e.qty ELSE 0 END) AS purchase_qty,
    SUM(CASE WHEN e.entry_kind = 'closing' THEN e.qty ELSE 0 END) AS closing_qty,
    SUM(CASE WHEN e.entry_kind = 'initial' THEN e.qty ELSE 0 END)
      + SUM(CASE WHEN e.entry_kind = 'purchase' THEN e.qty ELSE 0 END)
      - SUM(CASE WHEN e.entry_kind = 'closing' THEN e.qty ELSE 0 END) AS current_stock
  FROM public.warehouse_stock_entries e
  JOIN public.warehouses w ON w.id = e.warehouse_id
  JOIN public.products p ON p.id = e.product_id
  LEFT JOIN public.product_variations pv ON pv.id = e.variation_id
  WHERE (p_warehouse_id IS NULL OR e.warehouse_id = p_warehouse_id)
    AND (p_product_id IS NULL OR e.product_id = p_product_id)
    AND (p_variation_id IS NULL OR e.variation_id = p_variation_id)
    AND (
      v_query = ''
      OR p.name ILIKE '%' || v_query || '%'
      OR coalesce(pv.name, '') ILIKE '%' || v_query || '%'
    )
  GROUP BY e.warehouse_id, w.name, e.product_id, p.name, e.variation_id, pv.name
  ORDER BY p.name, COALESCE(pv.name, ''), w.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_units_between_warehouses(
    p_source uuid,
    p_destination uuid,
    p_items jsonb,
    p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_src_outlet uuid;
  v_dest_outlet uuid;
  v_mov_id uuid;
  v_items jsonb := COALESCE(p_items, '[]'::jsonb);
  v_item record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_source IS NULL OR p_destination IS NULL OR p_source = p_destination THEN
    RAISE EXCEPTION 'source and destination warehouses are required';
  END IF;

  SELECT outlet_id INTO v_src_outlet FROM public.warehouses WHERE id = p_source;
  SELECT outlet_id INTO v_dest_outlet FROM public.warehouses WHERE id = p_destination;
  IF v_src_outlet IS NULL OR v_dest_outlet IS NULL THEN
    RAISE EXCEPTION 'warehouse not found';
  END IF;

  IF NOT (
    public.is_admin(v_uid)
    OR public.has_role(v_uid, 'transfer_manager', v_src_outlet)
    OR public.has_role(v_uid, 'transfer_manager', v_dest_outlet)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'at least one line item is required';
  END IF;

  INSERT INTO public.stock_movements(
    status,
    source_location_type,
    source_location_id,
    dest_location_type,
    dest_location_id,
    note
  ) VALUES (
    'approved',
    'warehouse',
    p_source,
    'warehouse',
    p_destination,
    p_note
  ) RETURNING id INTO v_mov_id;

  FOR v_item IN
    SELECT
      (item->>'product_id')::uuid AS product_id,
      (item->>'variation_id')::uuid AS variation_id,
      COALESCE((item->>'qty')::numeric, 0) AS qty
    FROM jsonb_array_elements(v_items) AS item
  LOOP
    IF v_item.product_id IS NULL OR v_item.qty <= 0 THEN
      RAISE EXCEPTION 'each item requires product_id and positive qty';
    END IF;

    INSERT INTO public.stock_movement_items(
      movement_id,
      product_id,
      variation_id,
      qty
    ) VALUES (
      v_mov_id,
      v_item.product_id,
      v_item.variation_id,
      v_item.qty
    );
  END LOOP;

  PERFORM public.complete_stock_movement(v_mov_id);
  RETURN v_mov_id;
END;
$$;

ALTER TABLE IF EXISTS public.product_variations
  ADD COLUMN IF NOT EXISTS units_per_uom numeric NOT NULL DEFAULT 1 CHECK (units_per_uom > 0);

-- Allow catalog admins to edit variation-level size/pack metadata via Supabase UI.
ALTER TABLE IF EXISTS public.product_variations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_variations_admin_rw ON public.product_variations;
CREATE POLICY product_variations_admin_rw ON public.product_variations
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE IF EXISTS public.order_items
  ADD COLUMN IF NOT EXISTS qty_cases numeric,
  ADD COLUMN IF NOT EXISTS units_per_uom numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);

UPDATE public.order_items
SET
  qty_cases = coalesce(qty_cases, qty),
  units_per_uom = coalesce(units_per_uom, 1)
WHERE qty_cases IS NULL OR units_per_uom IS NULL;

UPDATE public.order_items oi
SET warehouse_id = coalesce(
      oi.warehouse_id,
      (SELECT pv.default_warehouse_id FROM public.product_variations pv WHERE pv.id = oi.variation_id),
      (SELECT prod.default_warehouse_id FROM public.products prod WHERE prod.id = oi.product_id)
    )
WHERE oi.warehouse_id IS NULL;

DROP FUNCTION IF EXISTS public.report_pack_consumption(timestamptz, timestamptz, uuid, uuid);
DROP VIEW IF EXISTS public.order_pack_consumption;
DROP FUNCTION IF EXISTS public.refresh_order_pack_expansions(uuid);
DROP TABLE IF EXISTS public.order_pack_expansions CASCADE;
DROP TABLE IF EXISTS public.product_pack_configs CASCADE;

-- View + RPC for standardized pack/unit consumption reporting.
CREATE OR REPLACE VIEW public.order_pack_consumption AS
SELECT
  oi.id,
  oi.order_id,
  o.order_number,
  o.outlet_id,
  outlets.name AS outlet_name,
  warehouse_source.id AS warehouse_id,
  warehouse_source.name AS warehouse_name,
  oi.product_id,
  prod.name AS product_name,
  oi.variation_id,
  pv.name AS variation_name,
  coalesce(oi.uom, pv.uom, prod.uom, 'Case') AS pack_label,
  coalesce(oi.qty_cases, oi.qty) AS packs_ordered,
  coalesce(oi.units_per_uom, pv.units_per_uom, prod.units_per_uom, 1) AS units_per_pack,
  oi.qty AS units_total,
  o.created_at,
  o.status
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
JOIN public.outlets ON outlets.id = o.outlet_id
LEFT JOIN public.products prod ON prod.id = oi.product_id
LEFT JOIN public.product_variations pv ON pv.id = oi.variation_id
LEFT JOIN public.outlet_primary_warehouse opw ON opw.outlet_id = o.outlet_id
LEFT JOIN public.warehouses warehouse_source
  ON warehouse_source.id = coalesce(oi.warehouse_id, pv.default_warehouse_id, prod.default_warehouse_id, opw.warehouse_id);

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

