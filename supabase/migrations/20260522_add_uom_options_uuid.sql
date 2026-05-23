alter table if exists public.uom_options
  add column if not exists id uuid default gen_random_uuid();

update public.uom_options
set id = gen_random_uuid()
where id is null;

alter table public.uom_options
  alter column id set not null;

alter table public.uom_options
  drop constraint if exists uom_options_id_key;

alter table public.uom_options
  add constraint uom_options_id_key unique (id);
