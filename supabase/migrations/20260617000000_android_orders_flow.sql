-- Android outlet + supervisor orders flow
-- Spec: docs/android-orders-app-flow.md
-- Apply after prior migrations. Run in Supabase SQL editor or: supabase db push

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_supervisor(p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user
      AND lower(coalesce(r.normalized_slug, r.slug)) = 'supervisor'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_warehouse_app_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_order_id
      AND o.source_event_id IS NULL
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS handoff_driver_name text,
  ADD COLUMN IF NOT EXISTS handoff_driver_signature_path text,
  ADD COLUMN IF NOT EXISTS handoff_driver_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_driver_name text,
  ADD COLUMN IF NOT EXISTS delivery_driver_signature_path text,
  ADD COLUMN IF NOT EXISTS delivery_driver_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_pdf_path text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.outlets
  ADD COLUMN IF NOT EXISTS uses_orders_app boolean NOT NULL DEFAULT false;

UPDATE public.outlets o
SET uses_orders_app = true
WHERE coalesce(o.active, true)
  AND o.auth_user_id IS NOT NULL
  AND o.default_receiving_warehouse_id IS NOT NULL
  AND NOT coalesce(o.uses_orders_app, false);

-- Optional: one line per (order, product, variant). Skip if duplicates exist — dedupe first.
-- CREATE UNIQUE INDEX IF NOT EXISTS ux_order_items_line
--   ON public.order_items (order_id, product_id, variation_key);

-- ---------------------------------------------------------------------------
-- 3. order_is_accessible — supervisors may read warehouse app orders
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_is_accessible(p_order_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  target_outlet uuid;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT outlet_id INTO target_outlet FROM public.orders WHERE id = p_order_id;
  IF target_outlet IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin(p_user_id) THEN
    RETURN true;
  END IF;

  IF public.is_supervisor(p_user_id) AND public.is_warehouse_app_order(p_order_id) THEN
    RETURN true;
  END IF;

  RETURN (
    target_outlet = ANY(COALESCE(public.member_outlet_ids(p_user_id), ARRAY[]::uuid[]))
    OR public.outlet_auth_user_matches(target_outlet, p_user_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Fulfillment trigger — allocate on accept, not on loaded (dispatch)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_order_locked_and_allocated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.status IN ('accepted', 'ordered', 'offloaded', 'delivered', 'completed')
     AND NOT COALESCE(NEW.locked, false) THEN
    PERFORM public.record_order_fulfillment(NEW.id);
    UPDATE public.orders
    SET locked = true,
        updated_at = now()
    WHERE id = NEW.id
      AND locked = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_lock_allocate ON public.orders;
CREATE TRIGGER trg_orders_lock_allocate
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (
    NEW.status = ANY (ARRAY['accepted', 'ordered', 'offloaded', 'delivered', 'completed'])
    AND NOT COALESCE(NEW.locked, false)
  )
  EXECUTE FUNCTION public.ensure_order_locked_and_allocated();

-- ---------------------------------------------------------------------------
-- 5. order_items edit rules (supervisor: qty + variant swap while placed)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_order_item_editable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_order public.orders%rowtype;
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_supervisor boolean := false;
  v_status text;
  v_merge text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found for item';
  END IF;

  v_is_admin := public.is_admin(v_uid);
  v_is_supervisor := public.is_supervisor(v_uid);
  v_status := lower(COALESCE(v_order.status, ''));

  IF NOT v_is_admin AND v_is_supervisor THEN
    IF TG_OP IN ('INSERT', 'DELETE') THEN
      v_merge := current_setting('order_items.supervisor_merge', true);
      IF TG_OP = 'DELETE' AND v_merge = 'on' AND v_status = 'placed' THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'supervisors cannot add or remove order items';
    END IF;

    IF v_status <> 'placed' THEN
      RAISE EXCEPTION 'supervisors can only edit items while order status is placed';
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
        RAISE EXCEPTION 'supervisors cannot change product on an order line';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF NOT v_is_admin THEN
    IF COALESCE(v_order.locked, false) THEN
      RAISE EXCEPTION 'order is locked';
    END IF;
    IF v_status NOT IN ('placed', 'draft') THEN
      RAISE EXCEPTION 'order items cannot be modified when status is %', v_order.status;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. place_order — warehouse app orders only (no POS source_event_id)
-- ---------------------------------------------------------------------------

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
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_now timestamptz := now();
  v_row public.orders%rowtype;
  v_item jsonb;
  v_qty numeric;
  v_qty_cases numeric;
  v_receiving_contains numeric;
  v_default_sales_wh uuid;
  v_variant_key text;
  v_route_wh uuid;
BEGIN
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'outlet id required';
  END IF;

  IF NOT (
    public.is_admin(v_uid)
    OR p_outlet_id = ANY(COALESCE(public.member_outlet_ids(v_uid), ARRAY[]::uuid[]))
  ) THEN
    RAISE EXCEPTION 'not authorized for outlet %', p_outlet_id;
  END IF;

  SELECT default_sales_warehouse_id
    INTO v_default_sales_wh
  FROM public.outlet_default_warehouses(p_outlet_id);

  INSERT INTO public.orders(
    outlet_id,
    order_number,
    status,
    locked,
    created_by,
    tz,
    pdf_path,
    employee_signed_name,
    employee_signature_path,
    employee_signed_at,
    source_event_id,
    updated_at,
    created_at
  ) VALUES (
    p_outlet_id,
    public.next_order_number(p_outlet_id),
    'placed',
    false,
    v_uid,
    COALESCE(current_setting('TIMEZONE', true), 'UTC'),
    p_pdf_path,
    COALESCE(NULLIF(p_employee_name, ''), p_employee_name),
    NULLIF(p_signature_path, ''),
    v_now,
    NULL,
    v_now,
    v_now
  )
  RETURNING * INTO v_row;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    IF (v_item ->> 'product_id') IS NULL THEN
      RAISE EXCEPTION 'product_id is required for each line item';
    END IF;

    v_receiving_contains := NULLIF(v_item ->> 'receiving_contains', '')::numeric;
    v_qty := COALESCE((v_item ->> 'qty')::numeric, 0);
    v_qty_cases := COALESCE((v_item ->> 'qty_cases')::numeric, NULL);
    IF v_qty_cases IS NULL AND v_receiving_contains IS NOT NULL AND v_receiving_contains > 0 THEN
      v_qty_cases := v_qty / v_receiving_contains;
    END IF;

    v_variant_key := public.normalize_variant_key(
      COALESCE(NULLIF(v_item ->> 'variation_key', ''), NULLIF(v_item ->> 'variation_id', ''), 'base')
    );

    v_route_wh := v_default_sales_wh;

    INSERT INTO public.order_items(
      order_id,
      product_id,
      variation_id,
      variation_key,
      warehouse_id,
      name,
      receiving_uom,
      consumption_uom,
      cost,
      qty,
      qty_cases,
      receiving_contains,
      amount
    ) VALUES (
      v_row.id,
      (v_item ->> 'product_id')::uuid,
      NULLIF(v_item ->> 'variation_id', '')::uuid,
      v_variant_key,
      v_route_wh,
      COALESCE(NULLIF(v_item ->> 'name', ''), 'Item'),
      COALESCE(NULLIF(v_item ->> 'receiving_uom', ''), 'each'),
      COALESCE(NULLIF(v_item ->> 'consumption_uom', ''), 'each'),
      COALESCE((v_item ->> 'cost')::numeric, 0),
      v_qty,
      v_qty_cases,
      v_receiving_contains,
      COALESCE((v_item ->> 'cost')::numeric, 0) * v_qty
    );
  END LOOP;

  order_id := v_row.id;
  order_number := v_row.order_number;
  created_at := v_row.created_at;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. accept_order — supervisor: placed → accepted (+ fulfillment via trigger)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_order(
  p_order_id uuid,
  p_supervisor_name text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_pdf_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
BEGIN
  IF NOT (public.is_admin(v_uid) OR public.is_supervisor(v_uid)) THEN
    RAISE EXCEPTION 'not authorized to accept orders';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF v_order.source_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'not a warehouse app order';
  END IF;

  IF lower(COALESCE(v_order.status, '')) <> 'placed' THEN
    RAISE EXCEPTION 'order must be placed before accept (current: %)', v_order.status;
  END IF;

  UPDATE public.orders
  SET status = 'accepted',
      accepted_at = now(),
      accepted_by = v_uid,
      approved_at = now(),
      approved_by = v_uid,
      modified_by_supervisor = true,
      modified_by_supervisor_name = COALESCE(NULLIF(p_supervisor_name, ''), modified_by_supervisor_name),
      supervisor_signed_name = COALESCE(NULLIF(p_supervisor_name, ''), supervisor_signed_name),
      supervisor_signature_path = COALESCE(NULLIF(p_signature_path, ''), supervisor_signature_path),
      supervisor_signed_at = CASE WHEN NULLIF(p_signature_path, '') IS NOT NULL THEN now() ELSE supervisor_signed_at END,
      approved_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), approved_pdf_path),
      updated_at = now()
  WHERE id = p_order_id;

  -- ensure_order_locked_and_allocated trigger runs record_order_fulfillment when locked=false
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. dispatch_order — supervisor handoff: accepted → loaded
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dispatch_order(
  p_order_id uuid,
  p_driver_name text,
  p_signature_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
BEGIN
  IF NOT (public.is_admin(v_uid) OR public.is_supervisor(v_uid)) THEN
    RAISE EXCEPTION 'not authorized to dispatch orders';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF v_order.source_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'not a warehouse app order';
  END IF;

  IF lower(COALESCE(v_order.status, '')) <> 'accepted' THEN
    RAISE EXCEPTION 'order must be accepted before dispatch (current: %)', v_order.status;
  END IF;

  UPDATE public.orders
  SET status = 'loaded',
      locked = true,
      handoff_driver_name = COALESCE(NULLIF(p_driver_name, ''), handoff_driver_name),
      handoff_driver_signature_path = NULLIF(p_signature_path, ''),
      handoff_driver_signed_at = now(),
      driver_signed_name = COALESCE(NULLIF(p_driver_name, ''), driver_signed_name),
      driver_signature_path = COALESCE(NULLIF(p_signature_path, ''), driver_signature_path),
      driver_signed_at = now(),
      updated_at = now()
  WHERE id = p_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. complete_order — outlet delivery sign: loaded → completed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_order(
  p_order_id uuid,
  p_driver_name text,
  p_signature_path text DEFAULT NULL,
  p_pdf_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  IF NOT (
    public.is_admin(v_uid)
    OR v_order.outlet_id = ANY(COALESCE(public.member_outlet_ids(v_uid), ARRAY[]::uuid[]))
  ) THEN
    RAISE EXCEPTION 'not authorized to complete order %', p_order_id;
  END IF;

  IF v_order.source_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'not a warehouse app order';
  END IF;

  IF lower(COALESCE(v_order.status, '')) <> 'loaded' THEN
    RAISE EXCEPTION 'order must be loaded before complete (current: %)', v_order.status;
  END IF;

  UPDATE public.orders
  SET status = 'completed',
      locked = true,
      delivery_driver_name = COALESCE(NULLIF(p_driver_name, ''), delivery_driver_name),
      delivery_driver_signature_path = NULLIF(p_signature_path, ''),
      delivery_driver_signed_at = now(),
      offloader_signed_name = COALESCE(NULLIF(p_driver_name, ''), offloader_signed_name),
      offloader_signature_path = COALESCE(NULLIF(p_signature_path, ''), offloader_signature_path),
      offloader_signed_at = now(),
      completed_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), completed_pdf_path),
      pdf_path = COALESCE(NULLIF(p_pdf_path, ''), pdf_path),
      offloaded_pdf_path = COALESCE(NULLIF(p_pdf_path, ''), offloaded_pdf_path),
      completed_at = now(),
      updated_at = now()
  WHERE id = p_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Supervisor variant replace + qty merge (same product_id)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.supervisor_merge_order_item_variant(
  p_order_item_id uuid,
  p_new_variant_key text,
  p_new_name text DEFAULT NULL,
  p_receiving_uom text DEFAULT NULL,
  p_consumption_uom text DEFAULT NULL,
  p_cost numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_src public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_new_key text;
  v_target_id uuid;
  v_target_qty numeric;
  v_merged_qty numeric;
BEGIN
  IF NOT (public.is_admin(v_uid) OR public.is_supervisor(v_uid)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_src FROM public.order_items WHERE id = p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order item not found';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_src.order_id FOR UPDATE;
  IF lower(COALESCE(v_order.status, '')) <> 'placed' THEN
    RAISE EXCEPTION 'order must be placed to merge variants';
  END IF;

  v_new_key := public.normalize_variant_key(COALESCE(p_new_variant_key, 'base'));

  SELECT oi.id, oi.qty
    INTO v_target_id, v_target_qty
  FROM public.order_items oi
  WHERE oi.order_id = v_src.order_id
    AND oi.product_id = v_src.product_id
    AND public.normalize_variant_key(oi.variation_key) = v_new_key
    AND oi.id <> v_src.id
  LIMIT 1;

  IF v_target_id IS NOT NULL THEN
    v_merged_qty := COALESCE(v_target_qty, 0) + COALESCE(v_src.qty, 0);
    UPDATE public.order_items
    SET qty = v_merged_qty,
        amount = COALESCE(cost, 0) * v_merged_qty
    WHERE id = v_target_id;

    PERFORM set_config('order_items.supervisor_merge', 'on', true);
    DELETE FROM public.order_items WHERE id = v_src.id;
    PERFORM set_config('order_items.supervisor_merge', 'off', true);
  ELSE
    UPDATE public.order_items
    SET variation_key = v_new_key,
        name = COALESCE(NULLIF(p_new_name, ''), name),
        receiving_uom = COALESCE(NULLIF(p_receiving_uom, ''), receiving_uom),
        consumption_uom = COALESCE(NULLIF(p_consumption_uom, ''), consumption_uom),
        cost = COALESCE(p_cost, cost),
        amount = COALESCE(COALESCE(p_cost, cost), 0) * COALESCE(qty, 0)
    WHERE id = v_src.id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Legacy RPC wrappers (keep Android / backoffice callers working)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.supervisor_approve_order(
  p_order_id uuid,
  p_supervisor_name text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_pdf_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.accept_order(p_order_id, p_supervisor_name, p_signature_path, p_pdf_path);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_loaded(
  p_order_id uuid,
  p_driver_name text,
  p_signature_path text DEFAULT NULL,
  p_pdf_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF public.is_supervisor(v_uid) OR public.is_admin(v_uid) THEN
    PERFORM public.dispatch_order(p_order_id, p_driver_name, p_signature_path);
    IF NULLIF(p_pdf_path, '') IS NOT NULL THEN
      UPDATE public.orders SET loaded_pdf_path = p_pdf_path, updated_at = now() WHERE id = p_order_id;
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION 'use dispatch_order from supervisor app; outlet completes via complete_order';
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_offloaded(
  p_order_id uuid,
  p_offloader_name text,
  p_signature_path text DEFAULT NULL,
  p_pdf_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  PERFORM public.complete_order(p_order_id, p_offloader_name, p_signature_path, p_pdf_path);
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. RLS — supervisors read warehouse app orders + order_items
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS orders_supervisor_select ON public.orders;
CREATE POLICY orders_supervisor_select ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.is_supervisor(auth.uid())
    AND source_event_id IS NULL
  );

DROP POLICY IF EXISTS order_items_supervisor_select ON public.order_items;
CREATE POLICY order_items_supervisor_select ON public.order_items
  FOR SELECT TO authenticated
  USING (
    public.is_supervisor(auth.uid())
    AND public.is_warehouse_app_order(order_id)
  );

DROP POLICY IF EXISTS order_items_supervisor_update ON public.order_items;
CREATE POLICY order_items_supervisor_update ON public.order_items
  FOR UPDATE TO authenticated
  USING (
    public.is_supervisor(auth.uid())
    AND public.is_warehouse_app_order(order_id)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND lower(o.status) = 'placed'
    )
  )
  WITH CHECK (
    public.is_supervisor(auth.uid())
    AND public.is_warehouse_app_order(order_id)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND lower(o.status) = 'placed'
    )
  );

-- ---------------------------------------------------------------------------
-- 13. Realtime (optional — for “order on the way” push)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 14. Optional one-time status rename for existing warehouse orders
-- Uncomment after reviewing production data.
-- ---------------------------------------------------------------------------

-- UPDATE public.orders SET status = 'accepted' WHERE status = 'ordered' AND source_event_id IS NULL;
-- UPDATE public.orders SET status = 'completed' WHERE status = 'offloaded' AND source_event_id IS NULL;
