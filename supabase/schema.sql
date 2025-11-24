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