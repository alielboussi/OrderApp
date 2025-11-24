-- Consolidate RLS policies for orders and order_items to reduce multiple permissive policies
-- and apply best-practice initplan usage with (select auth.uid()).
-- Run as a role with privileges to DROP/CREATE policies on these tables.

DO $$
BEGIN
  -- Ensure RLS is enabled (no-op if already enabled)
  ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;

  -- Helper to evaluate whether a user can see an order's outlet without relying on nested
  -- SELECTs that are themselves blocked by RLS. SECURITY DEFINER ensures it can fetch the
  -- outlet id, while we still enforce per-outlet membership/roles inside the function.
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.order_is_accessible(p_order_id uuid, p_user_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_temp
    AS $body$
    DECLARE
      target_outlet uuid;
    BEGIN
      IF p_order_id IS NULL OR p_user_id IS NULL THEN
        RETURN FALSE;
      END IF;
      SELECT outlet_id INTO target_outlet FROM public.orders WHERE id = p_order_id;
      IF target_outlet IS NULL THEN
        RETURN FALSE;
      END IF;
      IF public.is_admin(p_user_id) THEN
        RETURN TRUE;
      END IF;
      RETURN (
        target_outlet = ANY(COALESCE(public.member_outlet_ids(p_user_id), ARRAY[]::uuid[]))
        OR EXISTS (
          SELECT 1
          FROM public.outlet_users ou
          WHERE ou.user_id = p_user_id AND ou.outlet_id = target_outlet
        )
        OR public.has_role_any_outlet(p_user_id, 'supervisor', target_outlet)
        OR public.has_role_any_outlet(p_user_id, 'outlet', target_outlet)
      );
    END;
    $body$;
  $fn$;

  -- Drop existing overlapping policies on orders
  PERFORM 1;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_select_access ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_select_member_outlets ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_select_admin_all ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_outlet_rw ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_insert_outlet_or_admin ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_update_admin_only ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  -- Drop consolidated policies if they already exist (idempotency)
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_policy_select ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_policy_insert ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_policy_update ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_policy_delete ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;

  -- Create consolidated policies for orders (TO authenticated)
  EXECUTE $sql$
    CREATE POLICY orders_policy_select
    ON public.orders
    FOR SELECT TO authenticated
    USING (
      public.is_admin((select auth.uid()))
      OR outlet_id = ANY (public.member_outlet_ids((select auth.uid())))
      OR EXISTS (
        SELECT 1
        FROM public.outlet_users ou
        WHERE ou.user_id = (select auth.uid())
          AND ou.outlet_id = public.orders.outlet_id
      )
    );
  $sql$;

  EXECUTE $sql$
    CREATE POLICY orders_policy_insert
    ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (
      public.is_admin((select auth.uid()))
      OR outlet_id = ANY (public.member_outlet_ids((select auth.uid())))
      OR EXISTS (
        SELECT 1
        FROM public.outlet_users ou
        WHERE ou.user_id = (select auth.uid())
          AND ou.outlet_id = public.orders.outlet_id
      )
    );
  $sql$;

  EXECUTE $sql$
    CREATE POLICY orders_policy_update
    ON public.orders
    FOR UPDATE TO authenticated
    USING (public.is_admin((select auth.uid())))
    WITH CHECK (public.is_admin((select auth.uid())));
  $sql$;

  EXECUTE $sql$
    CREATE POLICY orders_policy_delete
    ON public.orders
    FOR DELETE TO authenticated
    USING (public.is_admin((select auth.uid())));
  $sql$;

  -- Drop existing overlapping policies on order_items
  BEGIN EXECUTE 'DROP POLICY IF EXISTS supervisor_update_qty_only ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_select_access ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_select_member_outlets ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_select_admin_all ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_insert_access ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_update_supervisor_or_admin ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_update_supervisor_admin ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_delete_admin_only ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_outlet_rw ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  -- Drop consolidated policies if they already exist (idempotency)
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_policy_select ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_policy_insert ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_policy_update ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_policy_delete ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;

  -- Create consolidated policies for order_items (TO authenticated)
  -- SELECT: admin OR member of the order's outlet
  EXECUTE $sql$
    CREATE POLICY order_items_policy_select
    ON public.order_items
    FOR SELECT TO authenticated
    USING (public.order_is_accessible(order_id, (select auth.uid())));
  $sql$;

  -- INSERT: admin OR member of the order's outlet
  EXECUTE $sql$
    CREATE POLICY order_items_policy_insert
    ON public.order_items
    FOR INSERT TO authenticated
    WITH CHECK (public.order_is_accessible(order_id, (select auth.uid())));
  $sql$;

  -- UPDATE: admin OR (supervisor/outlet member of the order's outlet)
  -- Note: Supervisor qty-only enforced by trigger at DB level.
  EXECUTE $sql$
    CREATE POLICY order_items_policy_update
    ON public.order_items
    FOR UPDATE TO authenticated
    USING (public.order_is_accessible(order_id, (select auth.uid())))
    WITH CHECK (public.order_is_accessible(order_id, (select auth.uid())));
  $sql$;

  -- DELETE: admin only
  EXECUTE $sql$
    CREATE POLICY order_items_policy_delete
    ON public.order_items
    FOR DELETE TO authenticated
    USING (public.is_admin((select auth.uid())));
  $sql$;

END
$$;