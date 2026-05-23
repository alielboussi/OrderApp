create table if not exists public.uom_options (
  id uuid not null default gen_random_uuid(),
  code text primary key,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uom_options_id_key unique (id)
);

create or replace function public.set_uom_options_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_uom_options_updated_at on public.uom_options;
create trigger set_uom_options_updated_at
before update on public.uom_options
for each row
execute function public.set_uom_options_updated_at();

insert into public.uom_options (code, label, sort_order)
values
  ('pc', 'Pc(s)', 10),
  ('g', 'Gram(s)', 20),
  ('kg', 'Kilogram(s)', 30),
  ('mg', 'Milligram(s)', 40),
  ('ml', 'Millilitre(s)', 50),
  ('l', 'Litre(s)', 60),
  ('cup', 'Cup(s)', 70),
  ('straw', 'Straw(s)', 80),
  ('toilet paper', 'Toilet Paper(s)', 90),
  ('case', 'Case(s)', 100),
  ('crate', 'Crate(s)', 110),
  ('bottle', 'Bottle(s)', 120),
  ('Tin Can', 'Tin Can(s)', 130),
  ('Jar', 'Jar(s)', 140),
  ('Block', 'Block(s)', 150),
  ('Bucket', 'Bucket(s)', 160),
  ('Bag', 'Bag(s)', 170),
  ('Tray', 'Tray(s)', 180),
  ('plastic', 'Plastic(s)', 190),
  ('Packet', 'Packet(s)', 200),
  ('Box', 'Box(es)', 210)
on conflict (code) do update
set label = excluded.label,
    sort_order = excluded.sort_order,
    active = true;
