ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouse_select_read" ON public.warehouses;

CREATE POLICY "warehouse_select_read"
ON public.warehouses
FOR SELECT
TO authenticated, anon
USING (true);
