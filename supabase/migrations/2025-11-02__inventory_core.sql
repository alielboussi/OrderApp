-- Inventory core schema: warehouses, stock movements, allocations, ledger
-- Safe to run multiple times

-- Enums
DO $$ BEGIN
  CREATE TYPE public.stock_location_type AS ENUM ('warehouse','outlet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.stock_reason AS ENUM (
    'opening_balance',
    'transfer_in',
    'transfer_out',
    'adjustment',
    'order_allocation',
    'order_release',
    'order_fulfill'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Warehouses owned by an outlet (e.g., main branch)
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Optional mapping: default/primary warehouse per outlet (for auto-fulfillment)
create table if not exists public.outlet_primary_warehouse (
  outlet_id uuid primary key references public.outlets(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  updated_at timestamptz not null default now()
);

-- Stock movement header (documents)
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending', -- pending|approved|completed|cancelled
  source_location_type public.stock_location_type,
  source_location_id uuid,
  dest_location_type public.stock_location_type,
  dest_location_id uuid,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid, -- auth.users.id
  completed_at timestamptz,
  note text
);

-- Stock movement lines
create table if not exists public.stock_movement_items (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.stock_movements(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  qty numeric not null CHECK (qty > 0)
);

-- Double-entry ledger capturing all stock changes at any location
create table if not exists public.stock_ledger (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  location_type public.stock_location_type not null,
  location_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  variation_id uuid references public.product_variations(id) on delete restrict,
  qty_change numeric not null,
  reason public.stock_reason not null,
  ref_movement_id uuid references public.stock_movements(id) on delete set null,
  ref_order_id uuid references public.orders(id) on delete set null,
  note text
);

-- Allow allocating order items to specific warehouses (multi-warehouse fulfillment)
create table if not exists public.order_item_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  qty numeric not null CHECK (qty > 0),
  unique (order_item_id, warehouse_id)
);
