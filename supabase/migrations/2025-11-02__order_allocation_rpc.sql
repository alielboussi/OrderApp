-- Allocate and transfer an order from a parent warehouse group (coldrooms) to the outlet
-- This approves and locks the order (idempotent), then creates per-warehouse movements
-- allocating from child coldrooms of the outlet's primary warehouse. If no children,
-- falls back to the primary warehouse itself.

create or replace function public.approve_lock_and_allocate_order(
  p_order_id uuid,
  p_strict boolean default true -- if true, raise on insufficient stock; else allocate partially
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_primary uuid;
  v_src record;
  v_item record;
  v_remain numeric;
  v_avail numeric;
  v_take numeric;
  v_mov_id uuid;
  v_existing uuid;
begin
  -- Lock order row and mark approved/locked (idempotent)
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
     raise exception 'order % not found', p_order_id;
  end if;
  if not v_order.locked then
    update public.orders
    set locked = true, approved_at = coalesce(approved_at, now()), approved_by = coalesce(approved_by, auth.uid())
    where id = p_order_id;
  end if;

  -- Determine primary warehouse for this outlet
  select warehouse_id into v_primary
  from public.outlet_primary_warehouse
  where outlet_id = v_order.outlet_id;

  if v_primary is null then
    raise exception 'no primary warehouse configured for outlet %', v_order.outlet_id;
  end if;

  -- Temporary mapping of source warehouse -> movement id
  create temporary table if not exists tmp_movements(
    warehouse_id uuid primary key,
    movement_id uuid
  ) on commit drop;
  delete from tmp_movements;

  -- For every order item, allocate across child coldrooms first (if any),
  -- ordered by available qty desc; else allocate from the primary itself
  for v_item in
    select oi.product_id, oi.variation_id, oi.qty from public.order_items oi where oi.order_id = p_order_id
  loop
    v_remain := coalesce(v_item.qty, 0);

    -- Child coldrooms ordered by availability
    for v_src in
      with avail as (
        select w.id as wid,
               coalesce(ws.qty, 0) as qty
        from public.warehouses w
        left join public.warehouse_stock_current ws
          on ws.warehouse_id = w.id
          and ws.product_id = v_item.product_id
          and (ws.variation_id is not distinct from v_item.variation_id)
        where w.parent_warehouse_id = v_primary and w.active
      )
      select * from avail order by qty desc
    loop
      exit when v_remain <= 0;
      v_avail := coalesce(v_src.qty, 0);
      if v_avail <= 0 then
        continue;
      end if;
      v_take := least(v_avail, v_remain);

      -- Find or create movement for this source warehouse
      select movement_id into v_existing from tmp_movements where warehouse_id = v_src.wid;
      if v_existing is null then
        insert into public.stock_movements(
          status, source_location_type, source_location_id,
          dest_location_type, dest_location_id
        ) values (
          'approved', 'warehouse', v_src.wid,
          'outlet', v_order.outlet_id
        ) returning id into v_mov_id;
        insert into tmp_movements(warehouse_id, movement_id) values (v_src.wid, v_mov_id);
      else
        v_mov_id := v_existing;
      end if;

      insert into public.stock_movement_items(movement_id, product_id, variation_id, qty)
      values (v_mov_id, v_item.product_id, v_item.variation_id, v_take);
      v_remain := v_remain - v_take;
    end loop;

    -- If no children existed or still remainder left, try the primary itself
    if v_remain > 0 then
      select coalesce(ws.qty, 0) into v_avail
      from public.warehouse_stock_current ws
      where ws.warehouse_id = v_primary
        and ws.product_id = v_item.product_id
        and (ws.variation_id is not distinct from v_item.variation_id);

      if coalesce(v_avail, 0) > 0 then
        v_take := least(v_avail, v_remain);
        select movement_id into v_existing from tmp_movements where warehouse_id = v_primary;
        if v_existing is null then
          insert into public.stock_movements(
            status, source_location_type, source_location_id,
            dest_location_type, dest_location_id
          ) values (
            'approved', 'warehouse', v_primary,
            'outlet', v_order.outlet_id
          ) returning id into v_mov_id;
          insert into tmp_movements(warehouse_id, movement_id) values (v_primary, v_mov_id);
        else
          v_mov_id := v_existing;
        end if;
        insert into public.stock_movement_items(movement_id, product_id, variation_id, qty)
        values (v_mov_id, v_item.product_id, v_item.variation_id, v_take);
        v_remain := v_remain - v_take;
      end if;
    end if;

    if p_strict and v_remain > 0 then
      raise exception 'insufficient stock for product %, variation %, need % more', v_item.product_id, v_item.variation_id, v_remain;
    end if;
  end loop;

  -- Complete all movements (write ledger)
  for v_src in select movement_id from tmp_movements loop
    perform public.complete_stock_movement(v_src.movement_id);
  end loop;
end;
$$;

grant execute on function public.approve_lock_and_allocate_order(uuid, boolean) to authenticated;
