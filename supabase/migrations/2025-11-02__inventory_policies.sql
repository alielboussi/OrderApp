-- Basic RLS policies for inventory (adjust as needed)

-- Enable RLS
alter table public.warehouses enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_movement_items enable row level security;
alter table public.stock_ledger enable row level security;
alter table public.order_item_allocations enable row level security;
alter table public.outlet_primary_warehouse enable row level security;

-- Warehouses: supervisors at the owning outlet can read/write
create policy wh_read on public.warehouses
as permissive for select to authenticated
using (
  exists (
    select 1 from public.outlet_users ou
    where ou.outlet_id = warehouses.outlet_id
      and ou.user_id = auth.uid()
  )
);

create policy wh_write on public.warehouses
as permissive for insert to authenticated
with check (
  exists (
    select 1 from public.outlet_users ou
    where ou.outlet_id = warehouses.outlet_id
      and ou.user_id = auth.uid()
  )
);

create policy wh_update on public.warehouses
as permissive for update to authenticated
using (
  exists (
    select 1 from public.outlet_users ou
    where ou.outlet_id = warehouses.outlet_id
      and ou.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.outlet_users ou
    where ou.outlet_id = warehouses.outlet_id
      and ou.user_id = auth.uid()
  )
);

-- Stock movements: readable by users of either source or destination outlet/warehouse; writable by source outlet users
create policy sm_read on public.stock_movements
as permissive for select to authenticated
using (
  (
    source_location_type = 'warehouse' and exists(
      select 1 from public.warehouses w
      join public.outlet_users ou on ou.outlet_id = w.outlet_id
      where w.id = stock_movements.source_location_id and ou.user_id = auth.uid()
    )
  )
  or (
    dest_location_type = 'warehouse' and exists(
      select 1 from public.warehouses w
      join public.outlet_users ou on ou.outlet_id = w.outlet_id
      where w.id = stock_movements.dest_location_id and ou.user_id = auth.uid()
    )
  )
  or (
    dest_location_type = 'outlet' and exists(
      select 1 from public.outlet_users ou
      where ou.outlet_id = stock_movements.dest_location_id and ou.user_id = auth.uid()
    )
  )
);

create policy sm_write on public.stock_movements
as permissive for insert to authenticated
with check (
  source_location_type = 'warehouse' and exists(
    select 1 from public.warehouses w
    join public.outlet_users ou on ou.outlet_id = w.outlet_id
    where w.id = stock_movements.source_location_id and ou.user_id = auth.uid()
  )
);

create policy sm_update on public.stock_movements
as permissive for update to authenticated
using (
  source_location_type = 'warehouse' and exists(
    select 1 from public.warehouses w
    join public.outlet_users ou on ou.outlet_id = w.outlet_id
    where w.id = stock_movements.source_location_id and ou.user_id = auth.uid()
  )
)
with check (
  source_location_type = 'warehouse' and exists(
    select 1 from public.warehouses w
    join public.outlet_users ou on ou.outlet_id = w.outlet_id
    where w.id = stock_movements.source_location_id and ou.user_id = auth.uid()
  )
);

-- Movement items: follow parent movement
create policy smi_read on public.stock_movement_items
as permissive for select to authenticated
using (
  exists (
    select 1 from public.stock_movements sm
    where sm.id = stock_movement_items.movement_id
  )
);

create policy smi_write on public.stock_movement_items
as permissive for insert to authenticated
with check (
  exists (
    select 1 from public.stock_movements sm
    where sm.id = stock_movement_items.movement_id
  )
);

-- Ledger: read own outlet entries or own warehouses; insert via definer RPCs only
create policy sl_read on public.stock_ledger
as permissive for select to authenticated
using (
  (location_type = 'outlet' and exists (
    select 1 from public.outlet_users ou where ou.outlet_id = stock_ledger.location_id and ou.user_id = auth.uid()
  ))
  or
  (location_type = 'warehouse' and exists (
    select 1 from public.warehouses w join public.outlet_users ou on ou.outlet_id = w.outlet_id
    where w.id = stock_ledger.location_id and ou.user_id = auth.uid()
  ))
);

-- Order item allocations: users belonging to outlet of the order and to the warehouse outlet
create policy alloc_read on public.order_item_allocations
as permissive for select to authenticated
using (
  exists (
    select 1 from public.orders o join public.outlet_users ou on ou.outlet_id = o.outlet_id
    where o.id = order_item_allocations.order_id and ou.user_id = auth.uid()
  )
);

create policy alloc_write on public.order_item_allocations
as permissive for insert to authenticated
with check (
  exists (
    select 1 from public.orders o join public.outlet_users ou on ou.outlet_id = o.outlet_id
    where o.id = order_item_allocations.order_id and ou.user_id = auth.uid()
  )
);
