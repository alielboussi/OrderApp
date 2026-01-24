-- Add operator_name to warehouse_transfers and backfill from auth users.

alter table public.warehouse_transfers
  add column if not exists operator_name text;

update public.warehouse_transfers wt
set operator_name = coalesce(wt.operator_name, u.raw_user_meta_data->>'display_name', u.email, 'Operator')
from auth.users u
where wt.created_by = u.id;

create or replace function public.set_transfer_operator_name()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.operator_name is null or btrim(new.operator_name) = '' then
    if new.created_by is not null then
      select coalesce(u.raw_user_meta_data->>'display_name', u.email, 'Operator')
        into new.operator_name
      from auth.users u
      where u.id = new.created_by;
    else
      new.operator_name := 'Operator';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_transfer_operator_name on public.warehouse_transfers;

create trigger trg_set_transfer_operator_name
before insert on public.warehouse_transfers
for each row
execute function public.set_transfer_operator_name();
