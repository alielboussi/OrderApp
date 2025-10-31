-- Mapping table linking Supabase Auth users to outlets (UUID-based)
create table if not exists public.outlet_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete restrict
);

create index if not exists outlet_users_outlet_id_idx on public.outlet_users(outlet_id);

-- Example seed (replace placeholders before running)
-- insert into public.outlet_users (user_id, outlet_id)
-- values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000')
-- on conflict (user_id) do update set outlet_id = excluded.outlet_id;
