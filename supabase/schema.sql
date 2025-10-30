-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto; -- for bcrypt crypt()
create extension if not exists pgjwt;    -- for JWT sign()

-- Roles note: client uses anon key to call RPC login. JWT will carry role=authenticated with outlet claims.

-- Compatibility wrapper for pgjwt: provide hmac(data text, key text, type text)
-- pgcrypto provides hmac(bytea, bytea, text); some pgjwt installs call a text variant.
-- This wrapper converts text to bytea and delegates to pgcrypto.hmac.
create or replace function public.hmac(data text, key text, type text)
returns bytea
language plpgsql
immutable
as $$
declare
  bdata bytea := convert_to(data, 'utf8');
  bkey  bytea := convert_to(key,  'utf8');
  outv  bytea;
begin
  -- Try Supabase default extensions schema first
  begin
    select extensions.hmac(bdata, bkey, type) into outv;
    return outv;
  exception when undefined_function then
    -- Fallback: some setups install pgcrypto functions in public schema
    begin
      select public.hmac(bdata, bkey, type) into outv;
      return outv;
    exception when undefined_function then
      raise exception 'pgcrypto hmac(bytea,bytea,text) not found in schemas extensions or public. Ensure pgcrypto is installed.';
    end;
  end;
end;
$$;

-- Outlets (storing plaintext password per user request; NOTE: not recommended for production)
create table if not exists public.outlets (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password text not null,
  created_at timestamp with time zone default now()
);

-- Products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  image_url text,
  uom text not null, -- unit of measure
  cost numeric(12,2) not null,
  has_variations boolean not null default false,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Product Variations
create table if not exists public.product_variations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  image_url text,
  uom text not null,
  cost numeric(12,2) not null,
  active boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists idx_product_variations_product on public.product_variations(product_id);

-- Per-outlet sequence table for order number generation
create table if not exists public.outlet_sequences (
  outlet_id uuid primary key references public.outlets(id) on delete cascade,
  next_seq bigint not null default 1
);

-- Orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  order_number text not null, -- e.g., OutletName0000001
  status text not null default 'Order Placed',
  created_at timestamptz not null default now(),
  tz text not null default 'Africa/Lusaka'
);
create index if not exists idx_orders_outlet on public.orders(outlet_id);

-- Order Items
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  variation_id uuid references public.product_variations(id),
  name text not null, -- product or variation display name
  uom text not null,
  cost numeric(12,2) not null,
  qty numeric(12,3) not null,
  amount numeric(14,2) not null
);
create index if not exists idx_order_items_order on public.order_items(order_id);

-- Assets table (catalog of static assets tracked in Storage)
create table if not exists public.assets (
  key text primary key,     -- e.g., 'seal.png'
  bucket text not null,     -- e.g., 'assets'
  url text not null
);

-- Helper: get JWT claims
create or replace function public.jwt_claim(claim text)
returns text language sql stable as $$
  select coalesce((current_setting('request.jwt.claims', true)::jsonb ->> claim), null);
$$;

-- RLS
alter table public.outlets enable row level security;
alter table public.products enable row level security;
alter table public.product_variations enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.outlet_sequences enable row level security;
alter table public.assets enable row level security;

-- Policies
-- Outlets: only allow outlet to see self (for name/email), no inserts from client here except admin-side seeding.
drop policy if exists outlets_self_select on public.outlets;
create policy outlets_self_select on public.outlets
for select using (
  (jwt_claim('outlet_id'))::uuid = id
);

-- Products and variations: readable by any outlet role; writes are admin-only (no policy for insert/update/delete)
drop policy if exists products_outlet_read on public.products;
create policy products_outlet_read on public.products
for select using ((jwt_claim('outlet_id')) is not null and active);

drop policy if exists product_variations_outlet_read on public.product_variations;
create policy product_variations_outlet_read on public.product_variations
for select using ((jwt_claim('outlet_id')) is not null and active);

-- Orders: outlet can see only their rows
drop policy if exists orders_outlet_rw on public.orders;
create policy orders_outlet_rw on public.orders
for all using ((jwt_claim('outlet_id'))::uuid = outlet_id)
with check ((jwt_claim('outlet_id'))::uuid = outlet_id);

-- Order items: only those under the outlet's orders
drop policy if exists order_items_outlet_rw on public.order_items;
create policy order_items_outlet_rw on public.order_items
for all using (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and (jwt_claim('outlet_id'))::uuid = o.outlet_id
  )
)
with check (
  exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and (jwt_claim('outlet_id'))::uuid = o.outlet_id
  )
);

-- Outlet sequences: only row for the outlet
drop policy if exists outlet_sequences_outlet_rw on public.outlet_sequences;
create policy outlet_sequences_outlet_rw on public.outlet_sequences
for all using ((jwt_claim('outlet_id'))::uuid = outlet_id)
with check ((jwt_claim('outlet_id'))::uuid = outlet_id);

-- Assets: read-only for outlet
drop policy if exists assets_read on public.assets;
create policy assets_read on public.assets
for select using ((jwt_claim('outlet_id')) is not null);

-- Outlet seeding helper (plaintext per request). Example:
-- insert into public.outlets(email, name, password)
-- values ('outlet@example.com','Outlet Name','YourTempPassword1');

-- RPC: outlet_login(email, password) -> returns { token, outlet_id, outlet_name }
create or replace function public.outlet_login(p_email text, p_password text)
returns json language plpgsql security definer as $$
declare
  v_outlet record;
  v_payload json;
  v_token text;
  -- If you cannot set app.settings.jwt_secret, paste your Legacy JWT Secret below
  -- and remove the angle brackets. This stays server-side in the DB function.
  -- Example: v_secret := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
  v_secret text := 'l8URwHldwkKqxE8VT5lgpoyH7cPJnIl8Dxc+32p+Rmsu5SvzsksfWVbJOn/jXR5TMTC9T6ZLO9JZvlzmTq1Hew==';  -- TODO: replace
  -- Token lifetime controls. By default, mint a long-lived token so the client
  -- does not need to refresh frequently. Adjust as needed.
  v_now int := extract(epoch from now())::int;
  -- 10 years (approximate, ignoring leap years). Adjust if you prefer a different duration.
  v_exp int := v_now + (60*60*24*365*10); -- ~10 years
begin
  -- Validate credentials (plaintext comparison per request)
  select id, name into v_outlet
  from public.outlets
  where email = p_email and password = p_password;

  if not found then
    raise exception 'invalid_email_or_password' using errcode = '28000';
  end if;

  -- Build JWT payload. Use role=authenticated (a real DB role in Supabase)
  -- Build JWT payload. Use role=authenticated (a real DB role in Supabase)
  -- Include standard claims so PostgREST and clients can validate/inspect.
  v_payload := json_build_object(
    'role', 'authenticated',
    'outlet_id', v_outlet.id::text,
    'outlet_name', v_outlet.name,
    'iat', v_now,
    'exp', v_exp,
    'iss', 'supabase',
    'aud', 'authenticated'
  );
  -- If DB parameter is not set, fall back to the pasted secret above
  v_token := sign(
    v_payload,
    coalesce(current_setting('app.settings.jwt_secret', true), v_secret)
  );

  return json_build_object(
    'token', v_token,
    'outlet_id', v_outlet.id,
    'outlet_name', v_outlet.name
  );
end;$$;

-- Ensure anon can execute login
grant execute on function public.outlet_login(text, text) to anon;

-- RPC: next_order_number(outlet_id)
create or replace function public.next_order_number(p_outlet_id uuid)
returns text language plpgsql security definer as $$
declare
  v_next bigint;
  v_name text;
  v_number text;
begin
  -- Ensure row exists
  insert into public.outlet_sequences(outlet_id, next_seq)
  values (p_outlet_id, 1)
  on conflict (outlet_id) do nothing;

  -- Lock row and increment atomically
  update public.outlet_sequences set next_seq = next_seq + 1
  where outlet_id = p_outlet_id
  returning next_seq - 1 into v_next;

  select name into v_name from public.outlets where id = p_outlet_id;
  v_number := v_name || to_char(v_next, 'FM0000000');
  return v_number;
end;$$;

grant execute on function public.next_order_number(uuid) to authenticated, anon, service_role;

-- RPC: place_order(outlet_id, items jsonb, employee_name text) -> returns order_id, order_number, created_at
-- items: [{product_id, variation_id, name, uom, cost, qty}]
create or replace function public.place_order(
  p_outlet_id uuid,
  p_items jsonb,
  p_employee_name text
)
returns table(order_id uuid, order_number text, created_at timestamptz) language plpgsql security definer as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_now timestamptz := timezone('Africa/Lusaka', now());
  v_item jsonb;
  v_cost numeric(12,2);
  v_qty numeric(12,3);
  v_amount numeric(14,2);
begin
  -- Only allow the outlet itself
  if (jwt_claim('outlet_id'))::uuid <> p_outlet_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_order_number := public.next_order_number(p_outlet_id);

  insert into public.orders(id, outlet_id, order_number, status, created_at, tz)
  values (v_order_id, p_outlet_id, v_order_number, 'Order Placed', v_now, 'Africa/Lusaka');

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cost := (v_item->>'cost')::numeric;
    v_qty := (v_item->>'qty')::numeric;
    v_amount := round(v_cost * v_qty, 2);
    insert into public.order_items(order_id, product_id, variation_id, name, uom, cost, qty, amount)
    values (
      v_order_id,
      nullif(v_item->>'product_id','')::uuid,
      nullif(v_item->>'variation_id','')::uuid,
      v_item->>'name',
      v_item->>'uom',
      v_cost,
      v_qty,
      v_amount
    );
  end loop;

  return query select v_order_id, v_order_number, v_now;
end;$$;

grant execute on function public.place_order(uuid, jsonb, text) to authenticated, anon, service_role;

-- RLS default denies other writes for products/variations/assets.
-- Ensure anon cannot read private tables except via outlet JWT claims.
