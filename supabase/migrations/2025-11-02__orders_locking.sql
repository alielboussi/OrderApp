-- Orders approval and locking, and RLS restriction for locked orders

-- Add approval fields
alter table public.orders
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists locked boolean not null default false;

-- Restrictive policy: block order_items updates if the order is locked
alter table public.order_items enable row level security;

create policy order_items_updates_unlocked_only on public.order_items
as restrictive
for update
to authenticated
using (
  exists (
    select 1 from public.orders o where o.id = order_items.order_id and not o.locked
  )
)
with check (true);
