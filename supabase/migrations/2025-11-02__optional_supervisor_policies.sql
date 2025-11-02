-- Optional: RLS policy to allow supervisors to update qty only (no insert/delete)
-- Assumptions:
--  - Row Level Security is enabled on public.order_items
--  - JWT has a 'role' claim set to 'supervisor' for supervisor users
--  - Users are mapped to outlets via public.outlet_users (user_id, outlet_id)

-- Enable RLS if not already
alter table public.order_items enable row level security;

-- Helper condition: same-outlet membership for the order
-- Uses a USING clause join to orders -> outlet_users
create policy supervisor_update_qty_only on public.order_items
as permissive
for update
TO authenticated
using (
  coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'),'') = 'supervisor'
  and exists (
    select 1
    from public.orders o
    join public.outlet_users ou on ou.outlet_id = o.outlet_id
    where o.id = order_items.order_id
      and ou.user_id = auth.uid()
  )
)
with check (
  -- In RLS policies you cannot reference OLD/NEW explicitly.
  -- This check applies to the proposed NEW row.
  qty is not null
);

-- Note: We intentionally do NOT create insert/delete policies for supervisors,
-- so those actions are denied by default under RLS.

-- The place_order() function uses SECURITY DEFINER and will bypass RLS
-- when inserting order headers and items.

-- Additionally enforce "qty-only" edits for supervisors via a trigger.
-- Policies cannot compare NEW vs OLD directly, so we add a BEFORE UPDATE trigger
-- that raises if any non-qty column changes when the requester is a supervisor.

create or replace function public.tg_order_items_supervisor_qty_only()
returns trigger
language plpgsql
as $$
declare
  v_role text := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'),'');
  v_same_outlet boolean := false;
begin
  -- Only enforce for supervisor requests; others proceed
  if v_role <> 'supervisor' then
    return new;
  end if;

  -- Verify the supervisor belongs to the outlet of this order
  select exists (
    select 1
    from public.orders o
    join public.outlet_users ou on ou.outlet_id = o.outlet_id
    where o.id = new.order_id
      and ou.user_id = auth.uid()
  ) into v_same_outlet;

  if not v_same_outlet then
    raise exception 'not allowed: supervisor not linked to this outlet';
  end if;

  -- Ensure only qty changed
  if (new.order_id       is distinct from old.order_id) or
     (new.product_id     is distinct from old.product_id) or
     (new.variation_id   is distinct from old.variation_id) or
     (new.name           is distinct from old.name) or
     (new.uom            is distinct from old.uom) or
     (new.cost           is distinct from old.cost) or
     (new.amount         is distinct from old.amount) then
    raise exception 'supervisors may only update qty';
  end if;

  -- qty itself must be present
  if new.qty is null then
    raise exception 'qty cannot be null';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_order_items_supervisor_qty_only on public.order_items;
create trigger tr_order_items_supervisor_qty_only
before update on public.order_items
for each row execute function public.tg_order_items_supervisor_qty_only();
