-- Consolidate RLS policies for orders and order_items to reduce multiple permissive policies
-- and apply best-practice initplan usage with (select auth.uid()).
-- Run as a role with privileges to DROP/CREATE policies on these tables.

DO $$
BEGIN
  -- Ensure RLS is enabled (no-op if already enabled)
  ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;

  -- Drop existing overlapping policies on orders
  PERFORM 1;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_select_access ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_select_member_outlets ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_select_admin_all ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_outlet_rw ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_insert_outlet_or_admin ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_update_admin_only ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;

  -- Create consolidated policies for orders (TO authenticated)
  EXECUTE $sql$
    CREATE POLICY orders_policy_select
    ON public.orders
    FOR SELECT TO authenticated
    USING (
      public.is_admin((select auth.uid()))
      OR outlet_id IN (
        SELECT outlet_id FROM public.member_outlet_ids((select auth.uid()))
      )
    );
  $sql$;

  EXECUTE $sql$
    CREATE POLICY orders_policy_insert
    ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (
      public.is_admin((select auth.uid()))
      OR outlet_id IN (
        SELECT outlet_id FROM public.member_outlet_ids((select auth.uid()))
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

  -- Create consolidated policies for order_items (TO authenticated)
  -- SELECT: admin OR member of the order's outlet
  EXECUTE $sql$
    CREATE POLICY order_items_policy_select
    ON public.order_items
    FOR SELECT TO authenticated
    USING (
      public.is_admin((select auth.uid()))
      OR EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.id = order_id
          AND o.outlet_id IN (
            SELECT outlet_id FROM public.member_outlet_ids((select auth.uid()))
          )
      )
    );
  $sql$;

  -- INSERT: admin OR member of the order's outlet
  EXECUTE $sql$
    CREATE POLICY order_items_policy_insert
    ON public.order_items
    FOR INSERT TO authenticated
    WITH CHECK (
      public.is_admin((select auth.uid()))
      OR EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.id = order_id
          AND o.outlet_id IN (
            SELECT outlet_id FROM public.member_outlet_ids((select auth.uid()))
          )
      )
    );
  $sql$;

  -- UPDATE: admin OR (supervisor/outlet member of the order's outlet)
  -- Note: Supervisor qty-only enforced by trigger at DB level.
  EXECUTE $sql$
    CREATE POLICY order_items_policy_update
    ON public.order_items
    FOR UPDATE TO authenticated
    USING (
      public.is_admin((select auth.uid()))
      OR (
        EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = order_id
            AND o.outlet_id IN (
              SELECT outlet_id FROM public.member_outlet_ids((select auth.uid()))
            )
        )
        AND (
          public.has_role_any_outlet((select auth.uid()), 'supervisor')
          OR public.has_role_any_outlet((select auth.uid()), 'outlet')
        )
      )
    )
    WITH CHECK (
      public.is_admin((select auth.uid()))
      OR (
        EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = order_id
            AND o.outlet_id IN (
              SELECT outlet_id FROM public.member_outlet_ids((select auth.uid()))
            )
        )
        AND (
          public.has_role_any_outlet((select auth.uid()), 'supervisor')
          OR public.has_role_any_outlet((select auth.uid()), 'outlet')
        )
      )
    );
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