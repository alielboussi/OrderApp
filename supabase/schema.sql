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
-- Role directory + assignment overhaul (2025-12-02)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.roles (slug, display_name, description)
VALUES
  ('admin', 'Administrator', 'Full access to every resource'),
  ('supervisor', 'Outlet Supervisor', 'Approves and reviews outlet orders'),
  ('outlet', 'Outlet Operator', 'Places orders on behalf of an outlet'),
  ('transfer_manager', 'Transfer Manager', 'Controls warehouse transfers'),
  ('warehouse_transfers', 'Warehouse Transfers', 'Night-shift transfer console operator')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

ALTER TABLE IF EXISTS public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_outlet_required_chk;

DROP VIEW IF EXISTS public.current_user_roles;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_roles'
      AND column_name = 'role'
      AND udt_name = 'role_type'
  ) THEN
    ALTER TABLE public.user_roles
      ALTER COLUMN role TYPE text USING role::text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  outlet_id uuid REFERENCES public.outlets(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.roles (slug, display_name)
SELECT DISTINCT ur.role, initcap(replace(ur.role, '_', ' '))
FROM public.user_roles ur
LEFT JOIN public.roles r ON r.slug = ur.role
WHERE r.slug IS NULL;

ALTER TABLE IF EXISTS public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_outlet_required_chk;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_slug_fkey;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_slug_fkey
  FOREIGN KEY (role) REFERENCES public.roles(slug) ON DELETE RESTRICT;

DROP INDEX IF EXISTS ux_user_roles_user_role_outlet;
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_roles_user_role_outlet
  ON public.user_roles (user_id, role, COALESCE(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_user_roles_active_role_user
  ON public.user_roles (role, user_id)
  WHERE active;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_roles.user_id = auth.uid());

DROP FUNCTION IF EXISTS public.has_role(public.role_type, uuid);
DROP FUNCTION IF EXISTS public.has_role(public.role_type);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'role_type'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    DROP TYPE public.role_type;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.current_user_roles AS
SELECT
  ur.role,
  ur.outlet_id,
  o.name AS outlet_name
FROM public.user_roles ur
LEFT JOIN public.outlets o ON o.id = ur.outlet_id
WHERE ur.user_id = auth.uid()
  AND ur.active;

CREATE OR REPLACE FUNCTION public.has_role(
  p_user_id uuid,
  p_role text,
  p_outlet_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_temp'
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL OR p_role IS NULL THEN FALSE
    ELSE EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p_user_id
        AND ur.active
        AND lower(ur.role) = lower(p_role)
        AND (
          p_outlet_id IS NULL
          OR ur.outlet_id IS NOT DISTINCT FROM p_outlet_id
        )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(
  p_user_id uuid,
  p_role text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_temp'
AS $$
  SELECT public.has_role(p_user_id, p_role, NULL::uuid);
$$;

CREATE OR REPLACE FUNCTION public.has_role(
  p_role text,
  p_outlet_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_temp'
AS $$
  SELECT public.has_role(auth.uid(), p_role, p_outlet_id);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_temp'
AS $$
  SELECT public.has_role(p_user_id, 'admin', NULL::uuid);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_temp'
AS $$
  SELECT public.is_admin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.tm_for_outlet(p_outlet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT public.has_role('transfer_manager', p_outlet_id);
$$;

CREATE OR REPLACE FUNCTION public.tm_for_warehouse(p_warehouse_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.warehouses w
    WHERE w.id = p_warehouse_id
      AND public.has_role('transfer_manager', w.outlet_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.whoami_roles()
RETURNS TABLE(user_id uuid, email text, is_admin boolean, roles text[], outlets jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_is_admin boolean := false;
  v_roles text[] := '{}';
  v_outlets jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, FALSE, ARRAY[]::text[], '[]'::jsonb;
    RETURN;
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.active
      AND lower(ur.role) = 'admin'
  ) INTO v_is_admin;

  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT ur.role
      FROM public.user_roles ur
      WHERE ur.user_id = v_uid
        AND ur.active
      ORDER BY ur.role
    ), '{}'
  ) INTO v_roles;

  SELECT COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object(
        'outlet_id', o.id,
        'outlet_name', o.name,
        'roles', ARRAY(SELECT DISTINCT ur_inner.role
                       FROM public.user_roles ur_inner
                       WHERE ur_inner.user_id = v_uid
                         AND ur_inner.active
                         AND ur_inner.outlet_id = o.id
                       ORDER BY ur_inner.role))
      )
      FROM public.outlets o
      WHERE EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = v_uid
          AND ur.active
          AND ur.outlet_id = o.id
      )
    ), '[]'::jsonb
  ) INTO v_outlets;

  RETURN QUERY SELECT v_uid, v_email, COALESCE(v_is_admin, FALSE), COALESCE(v_roles, '{}'), COALESCE(v_outlets, '[]'::jsonb);
END;
$$;

-- ------------------------------------------------------------
-- Order workflow + signature pipeline enhancements (2025-11-24)
-- ------------------------------------------------------------


-- Outlet-friendly reporting helpers
CREATE OR REPLACE VIEW public.outlet_order_log AS
SELECT
  o.id AS order_id,
  o.order_number,
  o.outlet_id,
  outlets.name AS outlet_name,
  o.status,
  o.lock_stage,
  o.created_at,
  o.employee_signed_name,
  o.supervisor_signed_name,
  o.driver_signed_name,
  o.offloader_signed_name,
  o.pdf_path,
  o.approved_pdf_path,
  o.loaded_pdf_path,
  o.offloaded_pdf_path
FROM public.orders o
JOIN public.outlets ON outlets.id = o.outlet_id;

CREATE OR REPLACE VIEW public.outlet_product_order_totals AS
SELECT
  o.outlet_id,
  outlets.name AS outlet_name,
  ps.product_id,
  prod.name AS product_name,
  ps.variation_id,
  pv.name AS variation_name,
  SUM(coalesce(ps.qty_cases, 0)) AS total_qty_cases,
  SUM(ps.qty_units) AS total_qty_units,
  MIN(o.created_at) AS first_order_at,
  MAX(o.created_at) AS last_order_at
FROM public.products_sold ps
JOIN public.orders o ON o.id = ps.order_id
JOIN public.outlets ON outlets.id = o.outlet_id
LEFT JOIN public.products prod ON prod.id = ps.product_id
LEFT JOIN public.product_variations pv ON pv.id = ps.variation_id
GROUP BY o.outlet_id, outlets.name, ps.product_id, prod.name, ps.variation_id, pv.name;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'order_lock_stage'
  ) THEN
    CREATE TYPE public.order_lock_stage AS ENUM ('outlet','supervisor','driver','offloader');
  END IF;
END $$;

ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS lock_stage public.order_lock_stage,
  ADD COLUMN IF NOT EXISTS warehouse_deducted_at timestamptz,
  ADD COLUMN IF NOT EXISTS warehouse_deducted_by uuid,
  ADD COLUMN IF NOT EXISTS outlet_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS outlet_received_by uuid;

ALTER TABLE IF EXISTS public.orders
  ALTER COLUMN locked SET DEFAULT true,
  ALTER COLUMN lock_stage SET DEFAULT 'outlet';

UPDATE public.orders
SET lock_stage = CASE
    WHEN lower(coalesce(status, '')) IN ('offloaded','delivered') THEN 'offloader'::public.order_lock_stage
    WHEN lower(coalesce(status, '')) = 'loaded' THEN 'driver'::public.order_lock_stage
    WHEN lower(coalesce(status, '')) = 'approved' THEN 'supervisor'::public.order_lock_stage
    ELSE 'outlet'::public.order_lock_stage
  END
WHERE lock_stage IS NULL
  OR (lock_stage = 'outlet'::public.order_lock_stage AND lower(coalesce(status, '')) IN ('approved','loaded','offloaded','delivered'));

-- Ensure deprecated outlet login metadata is removed now that outlets.auth_user_id controls mapping.
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

-- Normalize historical Offloaded -> Delivered terminology
UPDATE public.orders
SET status = 'Delivered'
WHERE lower(coalesce(status, '')) = 'offloaded';

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
    locked,
    lock_stage,
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
    true,
    'outlet'::public.order_lock_stage,
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
    package_contains,
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
    coalesce(pv.package_contains, prod.package_contains, 1) AS package_contains,
    p_item.qty_cases * coalesce(pv.package_contains, prod.package_contains, 1) AS qty_units,
    coalesce(p_item.cost, 0)::numeric * (p_item.qty_cases * coalesce(pv.package_contains, prod.package_contains, 1)) AS amount,
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
           WHEN lower(coalesce(o.status, '')) IN ('loaded', 'delivered') THEN o.status
           ELSE 'Approved'
         END,
         locked = true,
         lock_stage = 'supervisor'::public.order_lock_stage,
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

  PERFORM public.ensure_order_warehouse_deductions(p_order_id);

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
  IF v_status NOT IN ('approved', 'loaded', 'delivered') THEN
    RAISE EXCEPTION 'order % must be approved before loading', p_order_id;
  END IF;

  UPDATE public.orders o
         SET status = CASE
           WHEN lower(coalesce(o.status, '')) = 'delivered' THEN o.status
           ELSE 'Loaded'
         END,
         locked = true,
         lock_stage = 'driver'::public.order_lock_stage,
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
          OR public.order_is_accessible(p_order_id, v_uid)) THEN
    RAISE EXCEPTION 'not authorized to offload this order';
  END IF;

  v_status := lower(coalesce(v_order.status, ''));
  IF v_status NOT IN ('loaded', 'delivered') THEN
    RAISE EXCEPTION 'order % must be loaded before offloading', p_order_id;
  END IF;

  IF v_order.driver_signed_at IS NULL THEN
    RAISE EXCEPTION 'driver signature required before offloading order %', p_order_id;
  END IF;

    UPDATE public.orders o
      SET status = 'Delivered',
         locked = true,
         lock_stage = 'offloader'::public.order_lock_stage,
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

  PERFORM public.ensure_order_outlet_receipts(p_order_id);
  PERFORM public.log_products_sold(p_order_id);

  RETURN v_order;
END;
$$;

-- ------------------------------------------------------------
-- Outlet-auth consolidation (2025-11-29)
-- ------------------------------------------------------------

ALTER TABLE IF EXISTS public.outlets
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS outlets_auth_user_id_key
  ON public.outlets(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.outlet_users') IS NOT NULL THEN
    UPDATE public.outlets o
    SET auth_user_id = m.user_id
    FROM (
      SELECT outlet_id, MIN(user_id::text)::uuid AS user_id
      FROM public.outlet_users
      GROUP BY outlet_id
    ) AS m
    WHERE o.id = m.outlet_id
      AND (o.auth_user_id IS DISTINCT FROM m.user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.outlet_auth_user_matches(
  p_outlet_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.outlets o
    WHERE o.id = p_outlet_id
      AND o.auth_user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.next_order_number(
  p_outlet_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_next bigint;
  v_name text;
  v_number text;
  v_mapped uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id INTO v_mapped
  FROM public.outlets
  WHERE auth_user_id = auth.uid();

  IF v_mapped IS NULL THEN
    RAISE EXCEPTION 'no_outlet_mapping' USING ERRCODE = '42501';
  END IF;

  IF v_mapped <> p_outlet_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.outlet_sequences(outlet_id, next_seq)
  VALUES (p_outlet_id, 1)
  ON CONFLICT (outlet_id) DO NOTHING;

  UPDATE public.outlet_sequences
  SET next_seq = next_seq + 1
  WHERE outlet_id = p_outlet_id
  RETURNING next_seq - 1 INTO v_next;

  SELECT name INTO v_name FROM public.outlets WHERE id = p_outlet_id;
  v_number := v_name || to_char(v_next, 'FM0000000');
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.order_is_accessible(
  p_order_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_temp'
AS $$
DECLARE
  target_outlet uuid;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT outlet_id INTO target_outlet
  FROM public.orders
  WHERE id = p_order_id;

  IF target_outlet IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin(p_user_id) THEN
    RETURN TRUE;
  END IF;

  RETURN (
    target_outlet = ANY(COALESCE(public.member_outlet_ids(p_user_id), ARRAY[]::uuid[]))
    OR public.outlet_auth_user_matches(target_outlet, p_user_id)
    OR public.has_role_any_outlet(p_user_id, 'supervisor', target_outlet)
    OR public.has_role_any_outlet(p_user_id, 'outlet', target_outlet)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.whoami_outlet()
RETURNS TABLE(outlet_id uuid, outlet_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT o.id, o.name
  FROM public.outlets o
  WHERE o.auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.tg_order_items_supervisor_qty_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_temp'
AS $$
DECLARE
  v_role text := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'),'');
  v_same_outlet boolean := false;
BEGIN
  IF v_role <> 'supervisor' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.user_roles ur ON ur.outlet_id = o.outlet_id
    WHERE o.id = NEW.order_id
      AND ur.user_id = auth.uid()
      AND ur.active
      AND ur.role = 'supervisor'
  ) INTO v_same_outlet;

  IF NOT v_same_outlet THEN
    RAISE EXCEPTION 'not allowed: supervisor not linked to this outlet';
  END IF;

  IF (NEW.order_id       IS DISTINCT FROM OLD.order_id) OR
     (NEW.product_id     IS DISTINCT FROM OLD.product_id) OR
     (NEW.variation_id   IS DISTINCT FROM OLD.variation_id) OR
     (NEW.name           IS DISTINCT FROM OLD.name) OR
     (NEW.uom            IS DISTINCT FROM OLD.uom) OR
     (NEW.cost           IS DISTINCT FROM OLD.cost) OR
     (NEW.amount         IS DISTINCT FROM OLD.amount) THEN
    RAISE EXCEPTION 'supervisors may only update qty';
  END IF;

  IF NEW.qty IS NULL THEN
    RAISE EXCEPTION 'qty cannot be null';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS assets_read ON public.assets;
CREATE POLICY assets_read ON public.assets
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.outlets o WHERE o.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS alloc_read ON public.order_item_allocations;
CREATE POLICY alloc_read ON public.order_item_allocations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.outlets ot ON ot.id = o.outlet_id
      WHERE o.id = order_item_allocations.order_id
        AND ot.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS alloc_write ON public.order_item_allocations;
CREATE POLICY alloc_write ON public.order_item_allocations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.outlets ot ON ot.id = o.outlet_id
      WHERE o.id = order_item_allocations.order_id
        AND ot.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS orders_policy_insert ON public.orders;
CREATE POLICY orders_policy_insert ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin(auth.uid())
    OR orders.outlet_id = ANY(public.member_outlet_ids(auth.uid()))
    OR public.outlet_auth_user_matches(orders.outlet_id, auth.uid())
  );

DROP POLICY IF EXISTS orders_policy_select ON public.orders;
CREATE POLICY orders_policy_select ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR orders.outlet_id = ANY(public.member_outlet_ids(auth.uid()))
    OR public.outlet_auth_user_matches(orders.outlet_id, auth.uid())
  );

DROP POLICY IF EXISTS outlet_sequences_outlet_rw ON public.outlet_sequences;
CREATE POLICY outlet_sequences_outlet_rw ON public.outlet_sequences
  FOR ALL
  TO public
  USING (public.outlet_auth_user_matches(outlet_sequences.outlet_id, auth.uid()))
  WITH CHECK (public.outlet_auth_user_matches(outlet_sequences.outlet_id, auth.uid()));

DROP POLICY IF EXISTS outlets_self_select ON public.outlets;
CREATE POLICY outlets_self_select ON public.outlets
  FOR SELECT
  TO public
  USING (public.outlet_auth_user_matches(outlets.id, auth.uid()));

DROP POLICY IF EXISTS product_variations_outlet_read ON public.product_variations;
CREATE POLICY product_variations_outlet_read ON public.product_variations
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.outlets o WHERE o.auth_user_id = auth.uid()
    )
    AND active
  );

DROP POLICY IF EXISTS products_outlet_read ON public.products;
CREATE POLICY products_outlet_read ON public.products
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.outlets o WHERE o.auth_user_id = auth.uid()
    )
    AND active
  );

DROP POLICY IF EXISTS sl_read ON public.stock_ledger;
CREATE POLICY sl_read ON public.stock_ledger
  FOR SELECT
  TO authenticated
  USING (
    (
      stock_ledger.location_type = 'outlet'::public.stock_location_type
      AND public.outlet_auth_user_matches(stock_ledger.location_id, auth.uid())
    )
    OR (
      stock_ledger.location_type = 'warehouse'::public.stock_location_type
      AND EXISTS (
        SELECT 1
        FROM public.warehouses w
        JOIN public.outlets o ON o.id = w.outlet_id
        WHERE w.id = stock_ledger.location_id
          AND o.auth_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS sm_read ON public.stock_movements;
CREATE POLICY sm_read ON public.stock_movements
  FOR SELECT
  TO authenticated
  USING (
    (
      stock_movements.source_location_type = 'warehouse'::public.stock_location_type
      AND EXISTS (
        SELECT 1
        FROM public.warehouses w
        JOIN public.outlets o ON o.id = w.outlet_id
        WHERE w.id = stock_movements.source_location_id
          AND o.auth_user_id = auth.uid()
      )
    )
    OR (
      stock_movements.dest_location_type = 'warehouse'::public.stock_location_type
      AND EXISTS (
        SELECT 1
        FROM public.warehouses w
        JOIN public.outlets o ON o.id = w.outlet_id
        WHERE w.id = stock_movements.dest_location_id
          AND o.auth_user_id = auth.uid()
      )
    )
    OR (
      stock_movements.dest_location_type = 'outlet'::public.stock_location_type
      AND public.outlet_auth_user_matches(stock_movements.dest_location_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS sm_update ON public.stock_movements;
CREATE POLICY sm_update ON public.stock_movements
  FOR UPDATE
  TO authenticated
  USING (
    stock_movements.source_location_type = 'warehouse'::public.stock_location_type
    AND EXISTS (
      SELECT 1
      FROM public.warehouses w
      JOIN public.outlets o ON o.id = w.outlet_id
      WHERE w.id = stock_movements.source_location_id
        AND o.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    stock_movements.source_location_type = 'warehouse'::public.stock_location_type
    AND EXISTS (
      SELECT 1
      FROM public.warehouses w
      JOIN public.outlets o ON o.id = w.outlet_id
      WHERE w.id = stock_movements.source_location_id
        AND o.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sm_write ON public.stock_movements;
CREATE POLICY sm_write ON public.stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    stock_movements.source_location_type = 'warehouse'::public.stock_location_type
    AND EXISTS (
      SELECT 1
      FROM public.warehouses w
      JOIN public.outlets o ON o.id = w.outlet_id
      WHERE w.id = stock_movements.source_location_id
        AND o.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS wh_read ON public.warehouses;
CREATE POLICY wh_read ON public.warehouses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.outlets o
      WHERE o.id = warehouses.outlet_id
        AND o.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS wh_update ON public.warehouses;
CREATE POLICY wh_update ON public.warehouses
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.outlets o
      WHERE o.id = warehouses.outlet_id
        AND o.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.outlets o
      WHERE o.id = warehouses.outlet_id
        AND o.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS wh_write ON public.warehouses;
CREATE POLICY wh_write ON public.warehouses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.outlets o
      WHERE o.id = warehouses.outlet_id
        AND o.auth_user_id = auth.uid()
    )
  );

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "Outlet insert orders (auth.uid)" ON storage.objects';
    EXCEPTION WHEN undefined_object THEN NULL; END;

    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "Outlet update orders (auth.uid)" ON storage.objects';
    EXCEPTION WHEN undefined_object THEN NULL; END;

    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "Outlet delete orders (auth.uid)" ON storage.objects';
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END $$;

DROP TABLE IF EXISTS public.outlet_users;

-- ------------------------------------------------------------
-- Order-ledger posting + sold logging helpers
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_order_warehouse_deductions(
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_primary uuid;
  v_uid uuid := auth.uid();
  v_rows int := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF v_order.warehouse_deducted_at IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT warehouse_id INTO v_primary
  FROM public.outlet_primary_warehouse
  WHERE outlet_id = v_order.outlet_id;

  IF v_primary IS NULL THEN
    SELECT w.id INTO v_primary
    FROM public.warehouses w
    WHERE w.outlet_id = v_order.outlet_id
    LIMIT 1;
  END IF;

  INSERT INTO public.stock_ledger(
    location_type,
    location_id,
    product_id,
    variation_id,
    qty_change,
    reason,
    ref_order_id,
    note
  )
  SELECT
    'warehouse',
    COALESCE(oi.warehouse_id, pv.default_warehouse_id, prod.default_warehouse_id, v_primary),
    oi.product_id,
    oi.variation_id,
    -oi.qty,
    'order_fulfillment',
    oi.order_id,
    format('Order %s warehouse deduction', COALESCE(v_order.order_number, oi.order_id::text))
  FROM public.order_items oi
  LEFT JOIN public.product_variations pv ON pv.id = oi.variation_id
  LEFT JOIN public.products prod ON prod.id = oi.product_id
  WHERE oi.order_id = p_order_id
    AND COALESCE(oi.warehouse_id, pv.default_warehouse_id, prod.default_warehouse_id, v_primary) IS NOT NULL
    AND oi.qty > 0;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF COALESCE(v_rows, 0) = 0 THEN
    RAISE EXCEPTION 'no warehouse assignments found for order %', p_order_id;
  END IF;

  UPDATE public.orders
  SET warehouse_deducted_at = now(),
      warehouse_deducted_by = COALESCE(v_uid, warehouse_deducted_by)
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_order_outlet_receipts(
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_rows int := 0;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF v_order.outlet_received_at IS NOT NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.stock_ledger(
    location_type,
    location_id,
    product_id,
    variation_id,
    qty_change,
    reason,
    ref_order_id,
    note
  )
  SELECT
    'outlet',
    v_order.outlet_id,
    oi.product_id,
    oi.variation_id,
    oi.qty,
    'order_delivery',
    oi.order_id,
    format('Order %s outlet receipt', COALESCE(v_order.order_number, oi.order_id::text))
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.qty > 0;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF COALESCE(v_rows, 0) = 0 THEN
    RAISE EXCEPTION 'no line items to receive for order %', p_order_id;
  END IF;

  UPDATE public.orders
  SET outlet_received_at = now(),
      outlet_received_by = COALESCE(v_uid, outlet_received_by)
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_products_sold(
  p_order_id uuid,
  p_recorded_stage text DEFAULT 'delivered'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_primary uuid;
  v_uid uuid := auth.uid();
  v_stage text := lower(coalesce(p_recorded_stage, 'delivered'));
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  SELECT warehouse_id INTO v_primary
  FROM public.outlet_primary_warehouse
  WHERE outlet_id = v_order.outlet_id;

  IF v_primary IS NULL THEN
    SELECT w.id INTO v_primary
    FROM public.warehouses w
    WHERE w.outlet_id = v_order.outlet_id
    LIMIT 1;
  END IF;

  DELETE FROM public.products_sold WHERE order_id = p_order_id;

  INSERT INTO public.products_sold(
    order_id,
    order_item_id,
    outlet_id,
    product_id,
    variation_id,
    warehouse_id,
    qty_cases,
    package_contains,
    qty_units,
    recorded_stage,
    recorded_at,
    recorded_by
  )
  SELECT
    oi.order_id,
    oi.id,
    v_order.outlet_id,
    oi.product_id,
    oi.variation_id,
    COALESCE(oi.warehouse_id, pv.default_warehouse_id, prod.default_warehouse_id, v_primary),
    oi.qty_cases,
    oi.package_contains,
    oi.qty,
    v_stage,
    COALESCE(v_order.offloader_signed_at, now()),
    COALESCE(v_uid, v_order.approved_by)
  FROM public.order_items oi
  LEFT JOIN public.product_variations pv ON pv.id = oi.variation_id
  LEFT JOIN public.products prod ON prod.id = oi.product_id
  WHERE oi.order_id = p_order_id
    AND COALESCE(oi.warehouse_id, pv.default_warehouse_id, prod.default_warehouse_id, v_primary) IS NOT NULL
    AND oi.qty > 0;
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
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'package_contains'
  ) THEN
    ALTER TABLE public.products RENAME COLUMN case_size_units TO package_contains;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'units_per_uom'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'package_contains'
  ) THEN
    ALTER TABLE public.products RENAME COLUMN units_per_uom TO package_contains;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variations' AND column_name = 'case_size_units'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variations' AND column_name = 'package_contains'
  ) THEN
    ALTER TABLE public.product_variations RENAME COLUMN case_size_units TO package_contains;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variations' AND column_name = 'units_per_uom'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_variations' AND column_name = 'package_contains'
  ) THEN
    ALTER TABLE public.product_variations RENAME COLUMN units_per_uom TO package_contains;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'case_size_units'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'package_contains'
  ) THEN
    ALTER TABLE public.order_items RENAME COLUMN case_size_units TO package_contains;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'units_per_uom'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'package_contains'
  ) THEN
    ALTER TABLE public.order_items RENAME COLUMN units_per_uom TO package_contains;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS package_contains numeric NOT NULL DEFAULT 1 CHECK (package_contains > 0);

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

ALTER TABLE IF EXISTS public.warehouse_stock_entries
  ADD COLUMN IF NOT EXISTS qty_cases numeric,
  ADD COLUMN IF NOT EXISTS package_contains numeric;

UPDATE public.warehouse_stock_entries wse
SET package_contains = COALESCE(
      wse.package_contains,
      (SELECT pv.package_contains FROM public.product_variations pv WHERE pv.id = wse.variation_id),
      (SELECT prod.package_contains FROM public.products prod WHERE prod.id = wse.product_id),
      1
    )
WHERE wse.package_contains IS NULL;

UPDATE public.warehouse_stock_entries wse
SET qty_cases = CASE
    WHEN COALESCE(wse.package_contains, 0) <= 0 THEN NULL
    ELSE wse.qty / NULLIF(wse.package_contains, 0)
  END
WHERE wse.qty_cases IS NULL;

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
  p_qty numeric,
  p_variation_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_qty_input_mode text DEFAULT 'auto'
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
  v_target numeric := 0;
  v_pkg numeric := 1;
  v_qty_units numeric := 0;
  v_qty_cases numeric := NULL;
  v_mode text := lower(coalesce(p_qty_input_mode, 'auto'));
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
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive';
  END IF;

  SELECT coalesce(
           (SELECT package_contains FROM public.product_variations WHERE id = p_variation_id),
           (SELECT package_contains FROM public.products WHERE id = p_product_id),
           1
         )
    INTO v_pkg;

  IF v_mode NOT IN ('auto','units','cases') THEN
    RAISE EXCEPTION 'invalid qty_input_mode %', p_qty_input_mode;
  END IF;
  IF v_mode = 'auto' THEN
    v_mode := CASE WHEN v_pkg > 1 THEN 'cases' ELSE 'units' END;
  END IF;

  IF v_mode = 'cases' THEN
    v_qty_cases := p_qty;
    v_qty_units := p_qty * v_pkg;
  ELSE
    v_qty_units := p_qty;
    v_qty_cases := CASE WHEN v_pkg > 0 THEN p_qty / v_pkg ELSE NULL END;
  END IF;
  v_target := v_qty_units;

  INSERT INTO public.warehouse_stock_entries(
    warehouse_id,
    product_id,
    variation_id,
    entry_kind,
    qty,
    qty_cases,
    package_contains,
    note,
    recorded_by
  ) VALUES (
    p_warehouse_id,
    p_product_id,
    p_variation_id,
    p_entry_kind,
    v_qty_units,
    v_qty_cases,
    v_pkg,
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
    v_target := v_current + v_qty_units;
  END IF;

  PERFORM public.record_stocktake(
    p_warehouse_id,
    p_product_id,
    v_target,
    p_variation_id,
    coalesce(p_note, p_entry_kind::text),
    'units'
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
  ADD COLUMN IF NOT EXISTS package_contains numeric NOT NULL DEFAULT 1 CHECK (package_contains > 0);

-- Allow catalog admins to edit variation-level size/pack metadata via Supabase UI.
ALTER TABLE IF EXISTS public.product_variations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_variations_admin_rw ON public.product_variations;
CREATE POLICY product_variations_admin_rw ON public.product_variations
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE IF EXISTS public.order_items
  ADD COLUMN IF NOT EXISTS qty_cases numeric,
  ADD COLUMN IF NOT EXISTS package_contains numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);

UPDATE public.order_items
SET
  qty_cases = coalesce(qty_cases, qty),
  package_contains = coalesce(package_contains, 1)
WHERE qty_cases IS NULL OR package_contains IS NULL;

UPDATE public.order_items oi
SET warehouse_id = coalesce(
      oi.warehouse_id,
      (SELECT pv.default_warehouse_id FROM public.product_variations pv WHERE pv.id = oi.variation_id),
      (SELECT prod.default_warehouse_id FROM public.products prod WHERE prod.id = oi.product_id)
    )
WHERE oi.warehouse_id IS NULL;

DROP POLICY IF EXISTS order_items_updates_unlocked_only ON public.order_items;
CREATE POLICY order_items_updates_unlocked_only
  ON public.order_items
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          NOT o.locked
          OR public.is_admin(auth.uid())
          OR public.has_role(auth.uid(), 'supervisor', o.outlet_id)
        )
    )
  );

DROP FUNCTION IF EXISTS public.report_pack_consumption(timestamptz, timestamptz, uuid, uuid);
DROP VIEW IF EXISTS public.order_pack_consumption;
DROP FUNCTION IF EXISTS public.refresh_order_pack_expansions(uuid);
DROP TABLE IF EXISTS public.order_pack_expansions CASCADE;
DROP TABLE IF EXISTS public.product_pack_configs CASCADE;

CREATE TABLE IF NOT EXISTS public.products_sold (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id uuid REFERENCES public.product_variations(id) ON DELETE SET NULL,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  qty_cases numeric,
  package_contains numeric NOT NULL DEFAULT 1 CHECK (package_contains > 0),
  qty_units numeric NOT NULL CHECK (qty_units > 0),
  recorded_stage text NOT NULL DEFAULT 'delivered',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid DEFAULT auth.uid(),
  UNIQUE(order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_products_sold_order ON public.products_sold(order_id);
CREATE INDEX IF NOT EXISTS idx_products_sold_product ON public.products_sold(product_id, variation_id);

ALTER TABLE public.products_sold ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_sold_admin_rw ON public.products_sold;
CREATE POLICY products_sold_admin_rw ON public.products_sold
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS products_sold_members_select ON public.products_sold;
CREATE POLICY products_sold_members_select ON public.products_sold
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR public.order_is_accessible(order_id, auth.uid())
    OR public.has_role_any_outlet(auth.uid(), 'transfer_manager')
  );

INSERT INTO public.products_sold(
  order_id,
  order_item_id,
  outlet_id,
  product_id,
  variation_id,
  warehouse_id,
  qty_cases,
  package_contains,
  qty_units,
  recorded_stage,
  recorded_at,
  recorded_by
)
SELECT
  oi.order_id,
  oi.id,
  o.outlet_id,
  oi.product_id,
  oi.variation_id,
  COALESCE(oi.warehouse_id, pv.default_warehouse_id, prod.default_warehouse_id, opw.warehouse_id),
  oi.qty_cases,
  oi.package_contains,
  oi.qty,
  'delivered',
  COALESCE(o.offloader_signed_at, now()),
  o.approved_by
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
LEFT JOIN public.product_variations pv ON pv.id = oi.variation_id
LEFT JOIN public.products prod ON prod.id = oi.product_id
LEFT JOIN public.outlet_primary_warehouse opw ON opw.outlet_id = o.outlet_id
WHERE lower(coalesce(o.status, '')) IN ('offloaded','delivered')
  AND NOT EXISTS (
    SELECT 1 FROM public.products_sold ps WHERE ps.order_item_id = oi.id
  )
  AND COALESCE(oi.warehouse_id, pv.default_warehouse_id, prod.default_warehouse_id, opw.warehouse_id) IS NOT NULL;

CREATE OR REPLACE VIEW public.variances_sold AS
SELECT *
FROM public.products_sold
WHERE variation_id IS NOT NULL;

-- View retained for backward compatibility; now sources data from products_sold.
CREATE OR REPLACE VIEW public.order_pack_consumption AS
SELECT
  ps.order_item_id AS id,
  ps.order_id,
  o.order_number,
  o.outlet_id,
  outlets.name AS outlet_name,
  ps.warehouse_id,
  w.name AS warehouse_name,
  ps.product_id,
  prod.name AS product_name,
  ps.variation_id,
  pv.name AS variation_name,
  coalesce(oi.uom, pv.uom, prod.uom, 'Case') AS pack_label,
  coalesce(ps.qty_cases, ps.qty_units) AS packs_ordered,
  coalesce(ps.package_contains, pv.package_contains, prod.package_contains, 1) AS units_per_pack,
  ps.qty_units AS units_total,
  o.created_at,
  o.status
FROM public.products_sold ps
JOIN public.orders o ON o.id = ps.order_id
JOIN public.outlets ON outlets.id = o.outlet_id
LEFT JOIN public.order_items oi ON oi.id = ps.order_item_id
LEFT JOIN public.products prod ON prod.id = ps.product_id
LEFT JOIN public.product_variations pv ON pv.id = ps.variation_id
LEFT JOIN public.warehouses w ON w.id = ps.warehouse_id;

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
ALTER TYPE public.stock_reason ADD VALUE IF NOT EXISTS 'pos_sale';

-- ------------------------------------------------------------
-- POS sales ingestion + recipe-driven deductions
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pos_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id uuid REFERENCES public.product_variations(id) ON DELETE SET NULL,
  qty_units numeric NOT NULL CHECK (qty_units > 0),
  qty_cases numeric,
  package_contains numeric NOT NULL DEFAULT 1 CHECK (package_contains > 0),
  sale_reference text,
  sale_source text,
  sold_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL DEFAULT auth.uid(),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_sales_outlet ON public.pos_sales(outlet_id, sold_at DESC);

ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_sales_select ON public.pos_sales;
CREATE POLICY pos_sales_select ON public.pos_sales
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR public.outlet_auth_user_matches(pos_sales.outlet_id, auth.uid())
  );

DROP POLICY IF EXISTS pos_sales_write ON public.pos_sales;
CREATE POLICY pos_sales_write ON public.pos_sales
  FOR ALL
  USING (
    public.is_admin(auth.uid())
    OR public.outlet_auth_user_matches(pos_sales.outlet_id, auth.uid())
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.outlet_auth_user_matches(pos_sales.outlet_id, auth.uid())
  );

CREATE OR REPLACE FUNCTION public.record_pos_sale(
  p_outlet_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_variation_id uuid DEFAULT NULL,
  p_sale_reference text DEFAULT NULL,
  p_sale_source text DEFAULT 'pos',
  p_sold_at timestamptz DEFAULT now(),
  p_qty_input_mode text DEFAULT 'auto'
)
RETURNS public.pos_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pkg numeric := 1;
  v_qty_units numeric := 0;
  v_qty_cases numeric := NULL;
  v_mode text := lower(coalesce(p_qty_input_mode, 'auto'));
  v_sale public.pos_sales%ROWTYPE;
  v_primary_wh uuid;
  v_fallback_wh uuid;
  v_deductions int := 0;
  rec record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_outlet_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'outlet_id and product_id are required';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive';
  END IF;
  IF NOT (
    public.is_admin(v_uid)
    OR public.outlet_auth_user_matches(p_outlet_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'not authorized to record POS sale for this outlet';
  END IF;

  SELECT coalesce(
           (SELECT package_contains FROM public.product_variations WHERE id = p_variation_id),
           (SELECT package_contains FROM public.products WHERE id = p_product_id),
           1
         )
    INTO v_pkg;

  IF v_mode NOT IN ('auto','units','cases') THEN
    RAISE EXCEPTION 'invalid qty_input_mode %', p_qty_input_mode;
  END IF;
  IF v_mode = 'auto' THEN
    v_mode := CASE WHEN v_pkg > 1 THEN 'cases' ELSE 'units' END;
  END IF;

  IF v_mode = 'cases' THEN
    v_qty_cases := p_qty;
    v_qty_units := p_qty * v_pkg;
  ELSE
    v_qty_units := p_qty;
    v_qty_cases := CASE WHEN v_pkg > 0 THEN p_qty / v_pkg ELSE NULL END;
  END IF;

  INSERT INTO public.pos_sales(
    outlet_id,
    product_id,
    variation_id,
    qty_units,
    qty_cases,
    package_contains,
    sale_reference,
    sale_source,
    sold_at,
    recorded_by
  ) VALUES (
    p_outlet_id,
    p_product_id,
    p_variation_id,
    v_qty_units,
    v_qty_cases,
    v_pkg,
    nullif(btrim(p_sale_reference), ''),
    nullif(btrim(coalesce(p_sale_source, 'pos')), ''),
    coalesce(p_sold_at, now()),
    v_uid
  ) RETURNING * INTO v_sale;

  FOR rec IN
    SELECT *
    FROM public.recipe_deductions_for_product(p_product_id, p_variation_id, v_qty_units)
  LOOP
    v_deductions := v_deductions + 1;
    IF rec.warehouse_id IS NULL THEN
      RAISE EXCEPTION 'recipe warehouse missing for ingredient %', rec.ingredient_product_id;
    END IF;
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
      rec.warehouse_id,
      rec.ingredient_product_id,
      rec.ingredient_variation_id,
      -rec.qty_to_deduct,
      'pos_sale',
      NULL,
      format('POS sale %s (%s)', v_sale.id, coalesce(v_sale.sale_reference, 'n/a'))
    );
  END LOOP;

  IF v_deductions = 0 THEN
    SELECT warehouse_id INTO v_primary_wh
    FROM public.outlet_primary_warehouse
    WHERE outlet_id = p_outlet_id;

    IF v_primary_wh IS NULL THEN
      SELECT w.id INTO v_primary_wh
      FROM public.warehouses w
      WHERE w.outlet_id = p_outlet_id
      LIMIT 1;
    END IF;

    SELECT coalesce(
             (SELECT default_warehouse_id FROM public.product_variations WHERE id = p_variation_id),
             (SELECT default_warehouse_id FROM public.products WHERE id = p_product_id),
             v_primary_wh
           ) INTO v_fallback_wh;

    IF v_fallback_wh IS NULL THEN
      RAISE EXCEPTION 'no warehouse available for POS sale %', v_sale.id;
    END IF;

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
      v_fallback_wh,
      p_product_id,
      p_variation_id,
      -v_qty_units,
      'pos_sale',
      NULL,
      format('POS sale %s fallback deduction', v_sale.id)
    );
  END IF;

  RETURN v_sale;
END;
$$;

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

ALTER TABLE IF EXISTS public.warehouse_stocktakes
  ADD COLUMN IF NOT EXISTS counted_cases numeric,
  ADD COLUMN IF NOT EXISTS package_contains numeric;

UPDATE public.warehouse_stocktakes wst
SET package_contains = COALESCE(
      wst.package_contains,
      (SELECT pv.package_contains FROM public.product_variations pv WHERE pv.id = wst.variation_id),
      (SELECT prod.package_contains FROM public.products prod WHERE prod.id = wst.product_id),
      1
    )
WHERE wst.package_contains IS NULL;

UPDATE public.warehouse_stocktakes wst
SET counted_cases = CASE
    WHEN COALESCE(wst.package_contains, 0) <= 0 THEN NULL
    ELSE wst.counted_qty / NULLIF(wst.package_contains, 0)
  END
WHERE wst.counted_cases IS NULL;

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
  p_note text DEFAULT NULL,
  p_qty_input_mode text DEFAULT 'auto'
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
  v_pkg numeric := 1;
  v_mode text := lower(coalesce(p_qty_input_mode, 'auto'));
  v_qty_units numeric := coalesce(p_counted_qty, 0);
  v_qty_cases numeric := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT coalesce(
           (SELECT package_contains FROM public.product_variations WHERE id = p_variation_id),
           (SELECT package_contains FROM public.products WHERE id = p_product_id),
           1
         )
    INTO v_pkg;

  IF v_mode NOT IN ('auto','units','cases') THEN
    RAISE EXCEPTION 'invalid qty_input_mode %', p_qty_input_mode;
  END IF;
  IF v_mode = 'auto' THEN
    v_mode := CASE WHEN v_pkg > 1 THEN 'cases' ELSE 'units' END;
  END IF;

  IF v_mode = 'cases' THEN
    v_qty_cases := coalesce(p_counted_qty, 0);
    v_qty_units := v_qty_cases * v_pkg;
  ELSE
    v_qty_units := coalesce(p_counted_qty, 0);
    v_qty_cases := CASE WHEN v_pkg > 0 THEN v_qty_units / v_pkg ELSE NULL END;
  END IF;

  SELECT coalesce(qty, 0)
    INTO v_current
    FROM public.warehouse_stock_current
   WHERE warehouse_id = p_warehouse_id
     AND product_id = p_product_id
     AND (variation_id IS NOT DISTINCT FROM p_variation_id);

  v_delta := v_qty_units - v_current;

  INSERT INTO public.warehouse_stocktakes (
    warehouse_id,
    product_id,
    variation_id,
    counted_qty,
    counted_cases,
    package_contains,
    delta,
    note,
    recorded_by
  ) VALUES (
    p_warehouse_id,
    p_product_id,
    p_variation_id,
    v_qty_units,
    v_qty_cases,
    v_pkg,
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

-- ------------------------------------------------------------
-- Outlet stock periods, stocktakes, and balance tracking
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.outlet_stock_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outlet_stock_periods_outlet ON public.outlet_stock_periods(outlet_id, status);

ALTER TABLE public.outlet_stock_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlet_stock_periods_select ON public.outlet_stock_periods;
CREATE POLICY outlet_stock_periods_select ON public.outlet_stock_periods
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR public.outlet_auth_user_matches(outlet_stock_periods.outlet_id, auth.uid())
  );

DROP POLICY IF EXISTS outlet_stock_periods_manage ON public.outlet_stock_periods;
CREATE POLICY outlet_stock_periods_manage ON public.outlet_stock_periods
  FOR ALL
  USING (
    public.is_admin(auth.uid())
    OR public.outlet_auth_user_matches(outlet_stock_periods.outlet_id, auth.uid())
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.outlet_auth_user_matches(outlet_stock_periods.outlet_id, auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.outlet_stocktakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.outlet_stock_periods(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id uuid REFERENCES public.product_variations(id) ON DELETE SET NULL,
  counted_qty numeric NOT NULL CHECK (counted_qty >= 0),
  counted_cases numeric,
  package_contains numeric NOT NULL DEFAULT 1 CHECK (package_contains > 0),
  snapshot_kind text NOT NULL DEFAULT 'spot' CHECK (snapshot_kind IN ('opening','closing','spot')),
  note text,
  recorded_by uuid NOT NULL DEFAULT auth.uid(),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outlet_stocktakes_outlet ON public.outlet_stocktakes(outlet_id, snapshot_kind);

ALTER TABLE public.outlet_stocktakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlet_stocktakes_select ON public.outlet_stocktakes;
CREATE POLICY outlet_stocktakes_select ON public.outlet_stocktakes
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR public.outlet_auth_user_matches(outlet_stocktakes.outlet_id, auth.uid())
  );

DROP POLICY IF EXISTS outlet_stocktakes_manage ON public.outlet_stocktakes;
CREATE POLICY outlet_stocktakes_manage ON public.outlet_stocktakes
  FOR ALL
  USING (
    public.is_admin(auth.uid())
    OR public.outlet_auth_user_matches(outlet_stocktakes.outlet_id, auth.uid())
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.outlet_auth_user_matches(outlet_stocktakes.outlet_id, auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.outlet_stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.outlet_stock_periods(id) ON DELETE CASCADE,
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id uuid REFERENCES public.product_variations(id) ON DELETE SET NULL,
  opening_qty numeric NOT NULL DEFAULT 0,
  ordered_qty numeric NOT NULL DEFAULT 0,
  pos_sales_qty numeric NOT NULL DEFAULT 0,
  expected_qty numeric NOT NULL DEFAULT 0,
  actual_qty numeric,
  variance_qty numeric,
  closing_qty numeric,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_id, product_id, variation_id)
);

CREATE INDEX IF NOT EXISTS idx_outlet_stock_balances_outlet ON public.outlet_stock_balances(outlet_id, period_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_outlet_stock_balances_null_variation
  ON public.outlet_stock_balances(period_id, product_id)
  WHERE variation_id IS NULL;

ALTER TABLE public.outlet_stock_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlet_stock_balances_select ON public.outlet_stock_balances;
CREATE POLICY outlet_stock_balances_select ON public.outlet_stock_balances
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR public.outlet_auth_user_matches(outlet_stock_balances.outlet_id, auth.uid())
  );

CREATE OR REPLACE FUNCTION public.start_outlet_stock_period(
  p_outlet_id uuid,
  p_period_start timestamptz DEFAULT now()
)
RETURNS public.outlet_stock_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_period public.outlet_stock_periods%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'outlet_id is required';
  END IF;
  IF NOT (
    public.is_admin(v_uid)
    OR public.outlet_auth_user_matches(p_outlet_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'not authorized to start stock period';
  END IF;

  PERFORM 1
  FROM public.outlet_stock_periods
  WHERE outlet_id = p_outlet_id
    AND status = 'open';
  IF FOUND THEN
    RAISE EXCEPTION 'outlet % already has an open stock period', p_outlet_id;
  END IF;

  INSERT INTO public.outlet_stock_periods(
    outlet_id,
    period_start,
    status,
    created_by
  ) VALUES (
    p_outlet_id,
    coalesce(p_period_start, now()),
    'open',
    v_uid
  ) RETURNING * INTO v_period;

  RETURN v_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_outlet_stock_period(
  p_period_id uuid,
  p_period_end timestamptz DEFAULT now()
)
RETURNS public.outlet_stock_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_period public.outlet_stock_periods%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_period
  FROM public.outlet_stock_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock period % not found', p_period_id;
  END IF;

  IF NOT (
    public.is_admin(v_uid)
    OR public.outlet_auth_user_matches(v_period.outlet_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'not authorized to close this stock period';
  END IF;

  UPDATE public.outlet_stock_periods
     SET status = 'closed',
         period_end = coalesce(p_period_end, now()),
         closed_at = now()
   WHERE id = p_period_id
   RETURNING * INTO v_period;

  PERFORM public.refresh_outlet_stock_balances(v_period.id);

  RETURN v_period;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_outlet_stocktake(
  p_outlet_id uuid,
  p_product_id uuid,
  p_counted_qty numeric,
  p_variation_id uuid DEFAULT NULL,
  p_period_id uuid DEFAULT NULL,
  p_snapshot_kind text DEFAULT 'spot',
  p_note text DEFAULT NULL,
  p_qty_input_mode text DEFAULT 'auto'
)
RETURNS public.outlet_stocktakes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pkg numeric := 1;
  v_mode text := lower(coalesce(p_qty_input_mode, 'auto'));
  v_qty_units numeric := coalesce(p_counted_qty, 0);
  v_qty_cases numeric := NULL;
  v_row public.outlet_stocktakes%ROWTYPE;
  v_kind text := lower(coalesce(p_snapshot_kind, 'spot'));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_outlet_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'outlet_id and product_id are required';
  END IF;
  IF NOT (
    public.is_admin(v_uid)
    OR public.outlet_auth_user_matches(p_outlet_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'not authorized to record outlet stocktake';
  END IF;

  SELECT coalesce(
           (SELECT package_contains FROM public.product_variations WHERE id = p_variation_id),
           (SELECT package_contains FROM public.products WHERE id = p_product_id),
           1
         )
    INTO v_pkg;

  IF v_mode NOT IN ('auto','units','cases') THEN
    RAISE EXCEPTION 'invalid qty_input_mode %', p_qty_input_mode;
  END IF;
  IF v_mode = 'auto' THEN
    v_mode := CASE WHEN v_pkg > 1 THEN 'cases' ELSE 'units' END;
  END IF;

  IF v_mode = 'cases' THEN
    v_qty_cases := coalesce(p_counted_qty, 0);
    v_qty_units := v_qty_cases * v_pkg;
  ELSE
    v_qty_units := coalesce(p_counted_qty, 0);
    v_qty_cases := CASE WHEN v_pkg > 0 THEN v_qty_units / v_pkg ELSE NULL END;
  END IF;

  IF v_kind NOT IN ('opening','closing','spot') THEN
    RAISE EXCEPTION 'invalid snapshot_kind %', p_snapshot_kind;
  END IF;

  INSERT INTO public.outlet_stocktakes(
    outlet_id,
    period_id,
    product_id,
    variation_id,
    counted_qty,
    counted_cases,
    package_contains,
    snapshot_kind,
    note,
    recorded_by
  ) VALUES (
    p_outlet_id,
    p_period_id,
    p_product_id,
    p_variation_id,
    v_qty_units,
    v_qty_cases,
    v_pkg,
    v_kind,
    p_note,
    v_uid
  ) RETURNING * INTO v_row;

  IF p_period_id IS NOT NULL THEN
    PERFORM public.refresh_outlet_stock_balances(p_period_id);
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_outlet_stock_balances(
  p_period_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_period public.outlet_stock_periods%ROWTYPE;
  v_period_end timestamptz;
BEGIN
  SELECT * INTO v_period
  FROM public.outlet_stock_periods
  WHERE id = p_period_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock period % not found', p_period_id;
  END IF;

  v_period_end := coalesce(v_period.period_end, now());

  DELETE FROM public.outlet_stock_balances
  WHERE period_id = p_period_id;

  WITH ordered AS (
    SELECT
      ps.product_id,
      ps.variation_id,
      SUM(ps.qty_units) AS ordered_qty
    FROM public.products_sold ps
    JOIN public.orders o ON o.id = ps.order_id
    WHERE o.outlet_id = v_period.outlet_id
      AND o.created_at >= v_period.period_start
      AND o.created_at < v_period_end
    GROUP BY ps.product_id, ps.variation_id
  ),
  sales AS (
    SELECT
      product_id,
      variation_id,
      SUM(qty_units) AS sales_qty
    FROM public.pos_sales
    WHERE outlet_id = v_period.outlet_id
      AND sold_at >= v_period.period_start
      AND sold_at < v_period_end
    GROUP BY product_id, variation_id
  ),
  opening AS (
    SELECT
      product_id,
      variation_id,
      SUM(counted_qty) AS opening_qty
    FROM public.outlet_stocktakes
    WHERE outlet_id = v_period.outlet_id
      AND period_id = v_period.id
      AND snapshot_kind = 'opening'
    GROUP BY product_id, variation_id
  ),
  closing AS (
    SELECT
      product_id,
      variation_id,
      SUM(counted_qty) AS actual_qty
    FROM public.outlet_stocktakes
    WHERE outlet_id = v_period.outlet_id
      AND period_id = v_period.id
      AND snapshot_kind = 'closing'
    GROUP BY product_id, variation_id
  ),
  combos AS (
    SELECT DISTINCT product_id, variation_id
    FROM (
      SELECT product_id, variation_id FROM ordered
      UNION
      SELECT product_id, variation_id FROM sales
      UNION
      SELECT product_id, variation_id FROM opening
      UNION
      SELECT product_id, variation_id FROM closing
    ) AS unioned
  )
  INSERT INTO public.outlet_stock_balances(
    id,
    period_id,
    outlet_id,
    product_id,
    variation_id,
    opening_qty,
    ordered_qty,
    pos_sales_qty,
    expected_qty,
    actual_qty,
    variance_qty,
    closing_qty,
    computed_at
  )
  SELECT
    gen_random_uuid(),
    v_period.id,
    v_period.outlet_id,
    c.product_id,
    c.variation_id,
    coalesce(op.opening_qty, 0),
    coalesce(ord.ordered_qty, 0),
    coalesce(s.sales_qty, 0),
    coalesce(op.opening_qty, 0) + coalesce(ord.ordered_qty, 0) - coalesce(s.sales_qty, 0) AS expected_qty,
    cl.actual_qty,
    CASE
      WHEN cl.actual_qty IS NULL THEN NULL
      ELSE cl.actual_qty - (coalesce(op.opening_qty, 0) + coalesce(ord.ordered_qty, 0) - coalesce(s.sales_qty, 0))
    END AS variance_qty,
    coalesce(cl.actual_qty, coalesce(op.opening_qty, 0) + coalesce(ord.ordered_qty, 0) - coalesce(s.sales_qty, 0)),
    now()
  FROM combos c
  LEFT JOIN ordered ord ON ord.product_id = c.product_id AND ord.variation_id IS NOT DISTINCT FROM c.variation_id
  LEFT JOIN sales s ON s.product_id = c.product_id AND s.variation_id IS NOT DISTINCT FROM c.variation_id
  LEFT JOIN opening op ON op.product_id = c.product_id AND op.variation_id IS NOT DISTINCT FROM c.variation_id
  LEFT JOIN closing cl ON cl.product_id = c.product_id AND cl.variation_id IS NOT DISTINCT FROM c.variation_id;

END;
$$;

-- ------------------------------------------------------------
-- Recipe-driven deductions scaffolding (2025-11-29)
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'recipe_measure_unit'
  ) THEN
    CREATE TYPE public.recipe_measure_unit AS ENUM (
      'grams',
      'kilograms',
      'milligrams',
      'litres',
      'millilitres',
      'units'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.product_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variation_id uuid REFERENCES public.product_variations(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_recipes_product_variation
  ON public.product_recipes(product_id, variation_id NULLS LAST)
  WHERE active;

ALTER TABLE public.product_recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_recipes_admin_rw ON public.product_recipes;
CREATE POLICY product_recipes_admin_rw ON public.product_recipes
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS product_recipes_transfer_ro ON public.product_recipes;
CREATE POLICY product_recipes_transfer_ro ON public.product_recipes
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR public.has_role_any_outlet(auth.uid(), 'transfer_manager')
  );

CREATE TABLE IF NOT EXISTS public.product_recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.product_recipes(id) ON DELETE CASCADE,
  ingredient_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  ingredient_variation_id uuid REFERENCES public.product_variations(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  measure_unit public.recipe_measure_unit NOT NULL,
  qty_per_sale numeric NOT NULL CHECK (qty_per_sale > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe
  ON public.product_recipe_ingredients(recipe_id);

ALTER TABLE public.product_recipe_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_ingredients_admin_rw ON public.product_recipe_ingredients;
CREATE POLICY recipe_ingredients_admin_rw ON public.product_recipe_ingredients
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS recipe_ingredients_transfer_ro ON public.product_recipe_ingredients;
CREATE POLICY recipe_ingredients_transfer_ro ON public.product_recipe_ingredients
  FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR public.has_role_any_outlet(auth.uid(), 'transfer_manager')
  );

CREATE OR REPLACE FUNCTION public.touch_product_recipe()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_product_recipes_touch ON public.product_recipes;
CREATE TRIGGER tr_product_recipes_touch
  BEFORE UPDATE ON public.product_recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_product_recipe();

CREATE OR REPLACE FUNCTION public.recipe_deductions_for_product(
  p_product_id uuid,
  p_variation_id uuid DEFAULT NULL,
  p_qty_units numeric DEFAULT 1
)
RETURNS TABLE (
  warehouse_id uuid,
  ingredient_product_id uuid,
  ingredient_variation_id uuid,
  measure_unit public.recipe_measure_unit,
  qty_to_deduct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH candidate AS (
    SELECT pr.id
    FROM public.product_recipes pr
    WHERE pr.product_id = p_product_id
      AND pr.active
      AND (
        pr.variation_id IS NULL OR pr.variation_id = p_variation_id
      )
    ORDER BY (pr.variation_id IS NOT NULL) DESC, pr.updated_at DESC
    LIMIT 1
  )
  SELECT
    pri.warehouse_id,
    pri.ingredient_product_id,
    pri.ingredient_variation_id,
    pri.measure_unit,
    pri.qty_per_sale * coalesce(p_qty_units, 1)
  FROM candidate c
  JOIN public.product_recipe_ingredients pri ON pri.recipe_id = c.id;
$$;

