-- RLS policies rewritten to use auth.uid() + public.outlet_users mapping
-- Apply after creating public.outlet_users and public.outlets

-- Outlets: only allow mapped outlet to see its row
DROP POLICY IF EXISTS outlets_self_select ON public.outlets;
CREATE POLICY outlets_self_select ON public.outlets
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.outlet_users ou
    WHERE ou.user_id = auth.uid() AND ou.outlet_id = outlets.id
  )
);

-- Products: readable by any authenticated user mapped to an outlet; writes remain admin-only
DROP POLICY IF EXISTS products_outlet_read ON public.products;
CREATE POLICY products_outlet_read ON public.products
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.outlet_users ou WHERE ou.user_id = auth.uid())
  AND active
);

-- Product variations: same as products
DROP POLICY IF EXISTS product_variations_outlet_read ON public.product_variations;
CREATE POLICY product_variations_outlet_read ON public.product_variations
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.outlet_users ou WHERE ou.user_id = auth.uid())
  AND active
);

-- Orders: outlet can read/write only their rows
DROP POLICY IF EXISTS orders_outlet_rw ON public.orders;
CREATE POLICY orders_outlet_rw ON public.orders
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.outlet_users ou
    WHERE ou.user_id = auth.uid() AND ou.outlet_id = orders.outlet_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.outlet_users ou
    WHERE ou.user_id = auth.uid() AND ou.outlet_id = orders.outlet_id
  )
);

-- Order items: only those under the outlet's orders
DROP POLICY IF EXISTS order_items_outlet_rw ON public.order_items;
CREATE POLICY order_items_outlet_rw ON public.order_items
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.outlet_users ou ON ou.outlet_id = o.outlet_id
    WHERE o.id = order_items.order_id AND ou.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.outlet_users ou ON ou.outlet_id = o.outlet_id
    WHERE o.id = order_items.order_id AND ou.user_id = auth.uid()
  )
);

-- Outlet sequences: only the mapped outlet row
DROP POLICY IF EXISTS outlet_sequences_outlet_rw ON public.outlet_sequences;
CREATE POLICY outlet_sequences_outlet_rw ON public.outlet_sequences
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.outlet_users ou
    WHERE ou.user_id = auth.uid() AND ou.outlet_id = outlet_sequences.outlet_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.outlet_users ou
    WHERE ou.user_id = auth.uid() AND ou.outlet_id = outlet_sequences.outlet_id
  )
);

-- Assets: readable by any mapped user
DROP POLICY IF EXISTS assets_read ON public.assets;
CREATE POLICY assets_read ON public.assets
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.outlet_users ou WHERE ou.user_id = auth.uid())
);
