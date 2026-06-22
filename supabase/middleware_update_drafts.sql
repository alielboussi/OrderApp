-- Draft updates collected from catalog item/variant edits.
-- The "Send updates" flow in /Warehouse_Backoffice/catalog/menu reads from this table.

create table if not exists public.middleware_update_drafts (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('item', 'variant', 'menu_group')),
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);
