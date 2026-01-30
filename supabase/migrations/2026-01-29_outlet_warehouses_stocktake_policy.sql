-- Allow stocktake users to read outlet warehouse mappings scoped to their outlet roles.
-- Uses user_roles outlet_id scoping with the stocktake role id.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'outlet_warehouses'
      AND policyname = 'outlet_warehouses_select_stocktake'
  ) THEN
    CREATE POLICY outlet_warehouses_select_stocktake
      ON public.outlet_warehouses
      FOR SELECT
      TO authenticated
      USING (
        public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_id = '95b6a75d-bd46-4764-b5ea-981b1608f1ca'
            AND ur.outlet_id = outlet_warehouses.outlet_id
        )
      );
  END IF;
END $$;
