-- Primary migration: Replace place_order RPC to always insert order_items atomically
-- Safe to run multiple times

-- 1) Ensure required extension for UUIDs
create extension if not exists pgcrypto;

-- 2) Function: place_order
-- Signature matches the app's call via PostgREST
-- Params:
--   p_outlet_id     uuid       - required outlet id
--   p_items         jsonb      - JSON array of items: [{product_id?, variation_id?, name, uom, cost, qty}]
--   p_employee_name text       - captured for audit (not stored unless you add a column)
-- Returns: one row with order_id, order_number, created_at
create or replace function public.place_order(
  p_outlet_id uuid,
  p_items jsonb,
  p_employee_name text
)
returns table (
  order_id uuid,
  order_number text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
  v_order_id uuid;
  v_order_number text;
  v_created_at timestamptz;
begin
  -- Basic validation
  if p_outlet_id is null then
    raise exception 'p_outlet_id is required';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items must be a non-empty JSON array';
  end if;

  -- Allocate next outlet sequence atomically and build an order number
  -- Note: This mirrors the typical next_order_number RPC behavior.
  insert into public.outlet_sequences as os (outlet_id, next_seq)
  values (p_outlet_id, 1)
  on conflict (outlet_id)
  do update set next_seq = os.next_seq + 1
  returning os.next_seq into v_seq;

  -- Format as 6-digit zero-padded string (e.g., 000123)
  v_order_number := lpad(v_seq::text, 6, '0');

  -- Create order header
  insert into public.orders (outlet_id, order_number, status, tz, created_at)
  values (
    p_outlet_id,
    v_order_number,
    'placed',
    coalesce(current_setting('TIMEZONE', true), 'UTC'),
    now()
  )
  returning id, order_number, created_at
  into v_order_id, v_order_number, v_created_at;

  -- Insert all items from payload; compute amount = cost * qty on the fly
  insert into public.order_items (order_id, product_id, variation_id, name, uom, cost, qty, amount)
  select
    v_order_id,
    i.product_id,
    i.variation_id,
    i.name,
    i.uom,
    i.cost,
    i.qty,
    (coalesce(i.cost, 0)::numeric * coalesce(i.qty, 0)::numeric)
  from jsonb_to_recordset(p_items) as i(
    product_id uuid,
    variation_id uuid,
    name text,
    uom text,
    cost numeric,
    qty numeric
  );

  -- Return the inserted order header
  return query select v_order_id, v_order_number, v_created_at;
end;
$$;

-- 3) Permissions: expose to authenticated users (PostgREST RPC)
grant execute on function public.place_order(uuid, jsonb, text) to authenticated;

-- Optional: expose to anon (if you ever need it)
-- grant execute on function public.place_order(uuid, jsonb, text) to anon;
