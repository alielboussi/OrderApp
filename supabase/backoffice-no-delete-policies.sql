-- Back Office Manager (no delete) access policies
-- Role id: de9f2075-9c97-4da1-a2a0-59ed162947e7
-- Grants SELECT / INSERT / UPDATE where needed by Warehouse Backoffice.
-- No DELETE policies are created here.

-- Helper: inline predicate
-- EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
--   AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7')

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalog_items'
      AND policyname = 'catalog_items_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY catalog_items_backoffice_select
      ON public.catalog_items
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalog_items'
      AND policyname = 'catalog_items_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY catalog_items_backoffice_insert
      ON public.catalog_items
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalog_items'
      AND policyname = 'catalog_items_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY catalog_items_backoffice_update
      ON public.catalog_items
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalog_variants'
      AND policyname = 'catalog_variants_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY catalog_variants_backoffice_select
      ON public.catalog_variants
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalog_variants'
      AND policyname = 'catalog_variants_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY catalog_variants_backoffice_insert
      ON public.catalog_variants
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalog_variants'
      AND policyname = 'catalog_variants_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY catalog_variants_backoffice_update
      ON public.catalog_variants
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

-- Recipes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'recipes'
      AND policyname = 'recipes_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY recipes_backoffice_select
      ON public.recipes
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'recipes'
      AND policyname = 'recipes_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY recipes_backoffice_insert
      ON public.recipes
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'recipes'
      AND policyname = 'recipes_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY recipes_backoffice_update
      ON public.recipes
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

-- Outlet routing and POS mapping
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outlet_item_routes'
      AND policyname = 'outlet_item_routes_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY outlet_item_routes_backoffice_select
      ON public.outlet_item_routes
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outlet_item_routes'
      AND policyname = 'outlet_item_routes_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY outlet_item_routes_backoffice_insert
      ON public.outlet_item_routes
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outlet_item_routes'
      AND policyname = 'outlet_item_routes_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY outlet_item_routes_backoffice_update
      ON public.outlet_item_routes
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pos_item_map'
      AND policyname = 'pos_item_map_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY pos_item_map_backoffice_select
      ON public.pos_item_map
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pos_item_map'
      AND policyname = 'pos_item_map_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY pos_item_map_backoffice_insert
      ON public.pos_item_map
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pos_item_map'
      AND policyname = 'pos_item_map_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY pos_item_map_backoffice_update
      ON public.pos_item_map
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

-- Outlet and warehouse management
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outlets'
      AND policyname = 'outlets_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY outlets_backoffice_select
      ON public.outlets
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outlets'
      AND policyname = 'outlets_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY outlets_backoffice_insert
      ON public.outlets
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outlets'
      AND policyname = 'outlets_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY outlets_backoffice_update
      ON public.outlets
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outlet_warehouses'
      AND policyname = 'outlet_warehouses_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY outlet_warehouses_backoffice_select
      ON public.outlet_warehouses
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outlet_warehouses'
      AND policyname = 'outlet_warehouses_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY outlet_warehouses_backoffice_insert
      ON public.outlet_warehouses
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outlet_warehouses'
      AND policyname = 'outlet_warehouses_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY outlet_warehouses_backoffice_update
      ON public.outlet_warehouses
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouses'
      AND policyname = 'warehouses_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouses_backoffice_select
      ON public.warehouses
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouses'
      AND policyname = 'warehouses_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouses_backoffice_insert
      ON public.warehouses
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouses'
      AND policyname = 'warehouses_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouses_backoffice_update
      ON public.warehouses
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

-- Vehicles and suppliers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicles'
      AND policyname = 'vehicles_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY vehicles_backoffice_select
      ON public.vehicles
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicles'
      AND policyname = 'vehicles_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY vehicles_backoffice_insert
      ON public.vehicles
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vehicles'
      AND policyname = 'vehicles_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY vehicles_backoffice_update
      ON public.vehicles
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'suppliers'
      AND policyname = 'suppliers_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY suppliers_backoffice_select
      ON public.suppliers
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'suppliers'
      AND policyname = 'suppliers_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY suppliers_backoffice_insert
      ON public.suppliers
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'suppliers'
      AND policyname = 'suppliers_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY suppliers_backoffice_update
      ON public.suppliers
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

-- Purchases, transfers, damages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_purchase_receipts'
      AND policyname = 'warehouse_purchase_receipts_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_purchase_receipts_backoffice_select
      ON public.warehouse_purchase_receipts
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_purchase_receipts'
      AND policyname = 'warehouse_purchase_receipts_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_purchase_receipts_backoffice_insert
      ON public.warehouse_purchase_receipts
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_purchase_receipts'
      AND policyname = 'warehouse_purchase_receipts_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_purchase_receipts_backoffice_update
      ON public.warehouse_purchase_receipts
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_purchase_items'
      AND policyname = 'warehouse_purchase_items_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_purchase_items_backoffice_select
      ON public.warehouse_purchase_items
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_purchase_items'
      AND policyname = 'warehouse_purchase_items_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_purchase_items_backoffice_insert
      ON public.warehouse_purchase_items
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_purchase_items'
      AND policyname = 'warehouse_purchase_items_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_purchase_items_backoffice_update
      ON public.warehouse_purchase_items
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_transfers'
      AND policyname = 'warehouse_transfers_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_transfers_backoffice_select
      ON public.warehouse_transfers
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_transfers'
      AND policyname = 'warehouse_transfers_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_transfers_backoffice_insert
      ON public.warehouse_transfers
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_transfers'
      AND policyname = 'warehouse_transfers_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_transfers_backoffice_update
      ON public.warehouse_transfers
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_transfer_items'
      AND policyname = 'warehouse_transfer_items_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_transfer_items_backoffice_select
      ON public.warehouse_transfer_items
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_transfer_items'
      AND policyname = 'warehouse_transfer_items_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_transfer_items_backoffice_insert
      ON public.warehouse_transfer_items
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_transfer_items'
      AND policyname = 'warehouse_transfer_items_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_transfer_items_backoffice_update
      ON public.warehouse_transfer_items
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_damages'
      AND policyname = 'warehouse_damages_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_damages_backoffice_select
      ON public.warehouse_damages
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_damages'
      AND policyname = 'warehouse_damages_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_damages_backoffice_insert
      ON public.warehouse_damages
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_damages'
      AND policyname = 'warehouse_damages_backoffice_update'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_damages_backoffice_update
      ON public.warehouse_damages
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

-- Warehouse backoffice logs (select + insert only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_backoffice_logs'
      AND policyname = 'warehouse_backoffice_logs_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_backoffice_logs_backoffice_select
      ON public.warehouse_backoffice_logs
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_backoffice_logs'
      AND policyname = 'warehouse_backoffice_logs_backoffice_insert'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_backoffice_logs_backoffice_insert
      ON public.warehouse_backoffice_logs
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

-- Reporting tables (select only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY orders_backoffice_select
      ON public.orders
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname = 'order_items_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY order_items_backoffice_select
      ON public.order_items
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outlet_sales'
      AND policyname = 'outlet_sales_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY outlet_sales_backoffice_select
      ON public.outlet_sales
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

-- Stocktake and balances read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_stock_periods'
      AND policyname = 'warehouse_stock_periods_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_stock_periods_backoffice_select
      ON public.warehouse_stock_periods
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_stock_counts'
      AND policyname = 'warehouse_stock_counts_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY warehouse_stock_counts_backoffice_select
      ON public.warehouse_stock_counts
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

-- Note: warehouse_stock_variances and warehouse_stock_items are views.
-- Policies must be applied to the underlying tables they read from.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stock_ledger'
      AND policyname = 'stock_ledger_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY stock_ledger_backoffice_select
      ON public.stock_ledger
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

-- Misc reference tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outlet_products'
      AND policyname = 'outlet_products_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY outlet_products_backoffice_select
      ON public.outlet_products
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'uom_conversions'
      AND policyname = 'uom_conversions_backoffice_select'
  ) THEN
    EXECUTE $policy$CREATE POLICY uom_conversions_backoffice_select
      ON public.uom_conversions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = 'de9f2075-9c97-4da1-a2a0-59ed162947e7'
        )
      )$policy$;
  END IF;
END $$;

