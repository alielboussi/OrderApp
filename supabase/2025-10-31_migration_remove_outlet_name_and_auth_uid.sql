-- Migration: remove outlet_name from mapping and switch policies/RPCs to auth.uid() mapping
-- Date: 2025-10-31

-- 1) Remove outlet_name from mapping table (safe if column exists)
ALTER TABLE public.outlet_users DROP COLUMN IF EXISTS outlet_name;

-- 2) whoami_outlet now derives outlet_name from public.outlets
CREATE OR REPLACE FUNCTION public.whoami_outlet()
RETURNS TABLE (outlet_id uuid, outlet_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ou.outlet_id, o.name AS outlet_name
  FROM public.outlet_users ou
  JOIN public.outlets o ON o.id = ou.outlet_id
  WHERE ou.user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.whoami_outlet() FROM anon;
GRANT EXECUTE ON FUNCTION public.whoami_outlet() TO authenticated;

-- 3) Rewrite RLS policies to use auth.uid() + outlet_users mapping
-- Outlets
DROP POLICY IF EXISTS outlets_self_select ON public.outlets;
CREATE POLICY outlets_self_select ON public.outlets
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.outlet_users ou
    WHERE ou.user_id = auth.uid() AND ou.outlet_id = outlets.id
  )
);

-- Products
DROP POLICY IF EXISTS products_outlet_read ON public.products;
CREATE POLICY products_outlet_read ON public.products
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.outlet_users ou WHERE ou.user_id = auth.uid())
  AND active
);

-- Product variations
DROP POLICY IF EXISTS product_variations_outlet_read ON public.product_variations;
CREATE POLICY product_variations_outlet_read ON public.product_variations
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.outlet_users ou WHERE ou.user_id = auth.uid())
  AND active
);

-- Orders
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

-- Order items
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

-- Outlet sequences
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

-- Assets
DROP POLICY IF EXISTS assets_read ON public.assets;
CREATE POLICY assets_read ON public.assets
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.outlet_users ou WHERE ou.user_id = auth.uid())
);

-- 4) RPC overrides to verify outlet via mapping (no custom JWT claims)
CREATE OR REPLACE FUNCTION public.next_order_number(p_outlet_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_next bigint;
  v_name text;
  v_number text;
  v_mapped uuid;
BEGIN
  SELECT outlet_id INTO v_mapped FROM public.outlet_users WHERE user_id = auth.uid();
  IF v_mapped IS NULL THEN RAISE EXCEPTION 'no_outlet_mapping' USING ERRCODE = '42501'; END IF;
  IF v_mapped <> p_outlet_id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.outlet_sequences(outlet_id, next_seq)
  VALUES (p_outlet_id, 1)
  ON CONFLICT (outlet_id) DO NOTHING;

  UPDATE public.outlet_sequences SET next_seq = next_seq + 1
  WHERE outlet_id = p_outlet_id
  RETURNING next_seq - 1 INTO v_next;

  SELECT name INTO v_name FROM public.outlets WHERE id = p_outlet_id;
  v_number := v_name || to_char(v_next, 'FM0000000');
  RETURN v_number;
END;$$;
GRANT EXECUTE ON FUNCTION public.next_order_number(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.place_order(
  p_outlet_id uuid,
  p_items jsonb,
  p_employee_name text
)
RETURNS TABLE(order_id uuid, order_number text, created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_now timestamptz := timezone('Africa/Lusaka', now());
  v_item jsonb;
  v_cost numeric(12,2);
  v_qty numeric(12,3);
  v_amount numeric(14,2);
  v_mapped uuid;
BEGIN
  SELECT outlet_id INTO v_mapped FROM public.outlet_users WHERE user_id = auth.uid();
  IF v_mapped IS NULL THEN RAISE EXCEPTION 'no_outlet_mapping' USING ERRCODE = '42501'; END IF;
  IF v_mapped <> p_outlet_id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  v_order_number := public.next_order_number(p_outlet_id);

  INSERT INTO public.orders(id, outlet_id, order_number, status, created_at, tz)
  VALUES (v_order_id, p_outlet_id, v_order_number, 'Order Placed', v_now, 'Africa/Lusaka');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_cost := (v_item->>'cost')::numeric;
    v_qty := (v_item->>'qty')::numeric;
    v_amount := round(v_cost * v_qty, 2);
    INSERT INTO public.order_items(order_id, product_id, variation_id, name, uom, cost, qty, amount)
    VALUES (
      v_order_id,
      nullif(v_item->>'product_id','')::uuid,
      nullif(v_item->>'variation_id','')::uuid,
      v_item->>'name',
      v_item->>'uom',
      v_cost,
      v_qty,
      v_amount
    );
  END LOOP;

  RETURN QUERY SELECT v_order_id, v_order_number, v_now;
END;$$;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, jsonb, text) TO authenticated;
