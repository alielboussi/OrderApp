-- Inventory RPCs and views

-- Complete a stock movement: writes ledger entries and marks completed
create or replace function public.complete_stock_movement(p_movement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov record;
  v_item record;
begin
  select * into v_mov from public.stock_movements where id = p_movement_id for update;
  if not found then
    raise exception 'movement % not found', p_movement_id;
  end if;
  if v_mov.status = 'completed' then
    return; -- idempotent
  end if;
  if v_mov.status <> 'approved' and v_mov.status <> 'pending' then
    raise exception 'movement % has invalid status %', p_movement_id, v_mov.status;
  end if;

  for v_item in select * from public.stock_movement_items where movement_id = p_movement_id loop
    -- negative at source (if present)
    if v_mov.source_location_type is not null and v_mov.source_location_id is not null then
      insert into public.stock_ledger(
        location_type, location_id, product_id, variation_id, qty_change, reason, ref_movement_id
      ) values (
        v_mov.source_location_type, v_mov.source_location_id,
        v_item.product_id, v_item.variation_id,
        -1 * v_item.qty, 'transfer_out', p_movement_id
      );
    end if;
    -- positive at destination
    if v_mov.dest_location_type is not null and v_mov.dest_location_id is not null then
      insert into public.stock_ledger(
        location_type, location_id, product_id, variation_id, qty_change, reason, ref_movement_id
      ) values (
        v_mov.dest_location_type, v_mov.dest_location_id,
        v_item.product_id, v_item.variation_id,
        v_item.qty, 'transfer_in', p_movement_id
      );
    end if;
  end loop;

  update public.stock_movements
  set status = 'completed', completed_at = now()
  where id = p_movement_id;
end;
$$;

grant execute on function public.complete_stock_movement(uuid) to authenticated;

-- Approve and lock an order; optionally create a movement from the outlet's primary warehouse
create or replace function public.approve_and_lock_order(p_order_id uuid, p_auto_from_primary boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_primary uuid;
  v_mov_id uuid;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
     raise exception 'order % not found', p_order_id;
  end if;
  if v_order.locked then
     return; -- idempotent
  end if;

  update public.orders
  set locked = true, approved_at = now(), approved_by = auth.uid()
  where id = p_order_id;

  if not p_auto_from_primary then
    return;
  end if;

  -- Fetch primary warehouse for this outlet
  select warehouse_id into v_primary
  from public.outlet_primary_warehouse
  where outlet_id = v_order.outlet_id;

  if v_primary is null then
    -- No primary warehouse configured; skip auto movement
    return;
  end if;

  -- Create movement from warehouse -> outlet
  insert into public.stock_movements(
    status, source_location_type, source_location_id,
    dest_location_type, dest_location_id
  ) values (
    'approved', 'warehouse', v_primary,
    'outlet', v_order.outlet_id
  ) returning id into v_mov_id;

  -- Add lines for each order item qty
  for v_item in
    select oi.product_id, oi.variation_id, oi.qty
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    insert into public.stock_movement_items(movement_id, product_id, variation_id, qty)
    values (v_mov_id, v_item.product_id, v_item.variation_id, v_item.qty);
  end loop;

  -- Complete movement -> writes ledger
  perform public.complete_stock_movement(v_mov_id);
end;
$$;

grant execute on function public.approve_and_lock_order(uuid, boolean) to authenticated;

-- Current stock in each warehouse
create or replace view public.warehouse_stock_current as
select
  sl.location_id as warehouse_id,
  sl.product_id,
  sl.variation_id,
  sum(sl.qty_change) as qty
from public.stock_ledger sl
where sl.location_type = 'warehouse'
group by 1,2,3;

-- Current stock in each outlet
create or replace view public.outlet_stock_current as
select
  sl.location_id as outlet_id,
  sl.product_id,
  sl.variation_id,
  sum(sl.qty_change) as qty
from public.stock_ledger sl
where sl.location_type = 'outlet'
group by 1,2,3;
