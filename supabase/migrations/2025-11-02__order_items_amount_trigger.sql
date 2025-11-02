-- Optional but recommended: keep amount = qty * cost consistent
-- Safe to run multiple times

create or replace function public.tg_order_items_amount()
returns trigger
language plpgsql
as $$
begin
  new.amount := coalesce(new.qty, 0)::numeric * coalesce(new.cost, 0)::numeric;
  return new;
end;
$$;

-- Recreate trigger (drop if exists first)
drop trigger if exists tr_order_items_amount on public.order_items;
create trigger tr_order_items_amount
before insert or update of qty, cost on public.order_items
for each row execute function public.tg_order_items_amount();
