-- Fix stocktake access to outlet_warehouses using a SECURITY DEFINER function
-- so RLS on user_roles does not block the policy predicate.

CREATE OR REPLACE FUNCTION public.stocktake_outlet_ids(p_user uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    array_agg(ur.outlet_id),
    '{}'
  )
  FROM public.user_roles ur
  WHERE ur.user_id = p_user
    AND ur.role_id = '95b6a75d-bd46-4764-b5ea-981b1608f1ca'
    AND ur.outlet_id IS NOT NULL;
$$;

DROP POLICY IF EXISTS outlet_warehouses_select_stocktake ON public.outlet_warehouses;

CREATE POLICY outlet_warehouses_select_stocktake
  ON public.outlet_warehouses
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR outlet_id = ANY(COALESCE(public.stocktake_outlet_ids(auth.uid()), ARRAY[]::uuid[]))
  );
