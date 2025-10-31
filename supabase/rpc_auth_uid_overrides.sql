-- Override RPCs to rely on auth.uid() mapping instead of custom JWT claims

-- next_order_number(p_outlet_id uuid)
-- Keep the signature for client compatibility but verify against mapping
CREATE OR REPLACE FUNCTION public.next_order_number(p_outlet_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_next bigint;
  v_name text;
  v_number text;
  v_mapped uuid;
BEGIN
  SELECT outlet_id INTO v_mapped FROM public.outlet_users WHERE user_id = auth.uid();
  IF v_mapped IS NULL THEN
    RAISE EXCEPTION 'no_outlet_mapping' USING ERRCODE = '42501';
  END IF;
  IF v_mapped <> p_outlet_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

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

-- place_order(p_outlet_id uuid, p_items jsonb, p_employee_name text)
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
  IF v_mapped IS NULL THEN
    RAISE EXCEPTION 'no_outlet_mapping' USING ERRCODE = '42501';
  END IF;
  IF v_mapped <> p_outlet_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

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
