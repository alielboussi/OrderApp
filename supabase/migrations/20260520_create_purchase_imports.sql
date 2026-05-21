-- Track external purchase movements for idempotent API imports.

create table if not exists public.warehouse_purchase_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_movement_id text not null,
  source_invoice_id text,
  warehouse_id uuid,
  item_id uuid,
  variant_key text,
  qty_units numeric,
  unit_cost numeric,
  movement_at timestamptz,
  receipt_id uuid,
  status text not null default 'imported',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_purchase_import_source_movement
  on public.warehouse_purchase_imports (source, source_movement_id);

create index if not exists idx_purchase_imports_receipt
  on public.warehouse_purchase_imports (receipt_id);

create index if not exists idx_purchase_imports_warehouse
  on public.warehouse_purchase_imports (warehouse_id);
