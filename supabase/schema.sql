-- Unified schema: catalog + warehouse layering + outlet tracking
-- Replaces the legacy schema objects with the streamlined model described in the brief.

BEGIN;

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_layer') THEN
    CREATE TYPE public.stock_layer AS ENUM ('selling','production','materials');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_kind') THEN
    CREATE TYPE public.item_kind AS ENUM ('finished','ingredient');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'qty_unit') THEN
    CREATE TYPE public.qty_unit AS ENUM ('each','g','kg','mg','ml','l');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_reason') THEN
    CREATE TYPE public.stock_reason AS ENUM ('order_fulfillment','outlet_sale','recipe_consumption');
  END IF;

  BEGIN
    ALTER TYPE public.stock_reason ADD VALUE IF NOT EXISTS 'order_fulfillment';
    ALTER TYPE public.stock_reason ADD VALUE IF NOT EXISTS 'outlet_sale';
    ALTER TYPE public.stock_reason ADD VALUE IF NOT EXISTS 'recipe_consumption';
    ALTER TYPE public.stock_reason ADD VALUE IF NOT EXISTS 'warehouse_transfer';
    ALTER TYPE public.stock_reason ADD VALUE IF NOT EXISTS 'damage';
    ALTER TYPE public.stock_reason ADD VALUE IF NOT EXISTS 'purchase_receipt';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ------------------------------------------------------------
-- Core entities (warehouses, outlets, auth helpers)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  kind text,
  parent_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  stock_layer public.stock_layer NOT NULL DEFAULT 'selling',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouses_code ON public.warehouses ((lower(code))) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  channel text NOT NULL DEFAULT 'selling',
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_outlets_code ON public.outlets ((lower(code))) WHERE code IS NOT NULL;

ALTER TABLE IF EXISTS public.outlets
  DROP COLUMN IF EXISTS warehouse_id;

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  normalized_slug text GENERATED ALWAYS AS (lower(slug)) STORED,
  display_name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roles_normalized_slug ON public.roles(normalized_slug);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  outlet_id uuid REFERENCES public.outlets(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id, outlet_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_outlet ON public.user_roles(outlet_id);

ALTER TABLE IF EXISTS public.user_roles
  ADD COLUMN IF NOT EXISTS display_name text;

DO $$
DECLARE
  role_records constant jsonb := jsonb_build_array(
    jsonb_build_object('id', '8cafa111-b968-455c-bf4b-7bb8577daff7', 'slug', 'Branch', 'display_name', 'Branch'),
    jsonb_build_object('id', 'eef421e0-ce06-4518-93c4-6bb6525f6742', 'slug', 'Supervisor', 'display_name', 'Supervisor'),
    jsonb_build_object('id', '6b9e657a-6131-4a0b-8afa-0ce260f8ed0c', 'slug', 'Administrator', 'display_name', 'Administrator')
  );
  rec jsonb;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(role_records)
  LOOP
    INSERT INTO public.roles(id, slug, display_name)
    VALUES (
      (rec->>'id')::uuid,
      rec->>'slug',
      rec->>'display_name'
    ) ON CONFLICT (id) DO UPDATE SET
      slug = EXCLUDED.slug,
      display_name = EXCLUDED.display_name,
      active = true;
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- Warehouses
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS public.warehouses
  ADD COLUMN IF NOT EXISTS stock_layer public.stock_layer NOT NULL DEFAULT 'selling',
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Map legacy kind metadata to the new enum once, defaulting to production for unknowns.
UPDATE public.warehouses w
SET stock_layer = CASE
  WHEN lower(coalesce(w.kind, '')) IN ('main_coldroom','child_coldroom','selling_depot','outlet_warehouse') THEN 'selling'
  ELSE 'production'
END::public.stock_layer
WHERE w.stock_layer = 'selling';

-- ------------------------------------------------------------
-- Catalog (shared by outlet selling and production materials)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text,
  item_kind public.item_kind NOT NULL,
  base_unit public.qty_unit NOT NULL DEFAULT 'each',
  consumption_uom text NOT NULL DEFAULT 'each',
  purchase_pack_unit text NOT NULL DEFAULT 'each',
  units_per_purchase_pack numeric NOT NULL DEFAULT 1 CHECK (units_per_purchase_pack > 0),
  purchase_unit_mass numeric CHECK (purchase_unit_mass IS NULL OR purchase_unit_mass > 0),
  purchase_unit_mass_uom public.qty_unit,
  transfer_unit text NOT NULL DEFAULT 'each',
  transfer_quantity numeric NOT NULL DEFAULT 1 CHECK (transfer_quantity > 0),
  cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0),
  has_variations boolean NOT NULL DEFAULT false,
  locked_from_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  outlet_order_visible boolean NOT NULL DEFAULT true,
  image_url text,
  default_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_name_unique ON public.catalog_items ((lower(name)));
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_sku_unique ON public.catalog_items ((lower(sku))) WHERE sku IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_items' AND column_name = 'uom'
  ) THEN
    ALTER TABLE public.catalog_items RENAME COLUMN uom TO consumption_uom;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_items' AND column_name = 'package_contains'
  ) THEN
    ALTER TABLE public.catalog_items RENAME COLUMN package_contains TO units_per_purchase_pack;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_items' AND column_name = 'receiving_contains'
  ) THEN
    ALTER TABLE public.catalog_items RENAME COLUMN receiving_contains TO units_per_purchase_pack;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_items' AND column_name = 'receiving_uom'
  ) THEN
    ALTER TABLE public.catalog_items RENAME COLUMN receiving_uom TO purchase_pack_unit;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.catalog_items
  ADD COLUMN IF NOT EXISTS consumption_uom text NOT NULL DEFAULT 'each',
  ADD COLUMN IF NOT EXISTS purchase_pack_unit text NOT NULL DEFAULT 'each',
  ADD COLUMN IF NOT EXISTS units_per_purchase_pack numeric NOT NULL DEFAULT 1 CHECK (units_per_purchase_pack > 0),
  ADD COLUMN IF NOT EXISTS purchase_unit_mass numeric CHECK (purchase_unit_mass IS NULL OR purchase_unit_mass > 0),
  ADD COLUMN IF NOT EXISTS purchase_unit_mass_uom public.qty_unit,
  ADD COLUMN IF NOT EXISTS transfer_unit text NOT NULL DEFAULT 'each',
  ADD COLUMN IF NOT EXISTS transfer_quantity numeric NOT NULL DEFAULT 1 CHECK (transfer_quantity > 0),
  ADD COLUMN IF NOT EXISTS cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0),
  ADD COLUMN IF NOT EXISTS has_variations boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_from_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outlet_order_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS default_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_items_locked_from ON public.catalog_items(locked_from_warehouse_id);

UPDATE public.catalog_items
SET locked_from_warehouse_id = default_warehouse_id
WHERE locked_from_warehouse_id IS NULL
  AND default_warehouse_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.catalog_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  consumption_uom text NOT NULL DEFAULT 'each',
  purchase_pack_unit text NOT NULL DEFAULT 'each',
  units_per_purchase_pack numeric NOT NULL DEFAULT 1 CHECK (units_per_purchase_pack > 0),
  purchase_unit_mass numeric CHECK (purchase_unit_mass IS NULL OR purchase_unit_mass > 0),
  purchase_unit_mass_uom public.qty_unit,
  transfer_unit text NOT NULL DEFAULT 'each',
  transfer_quantity numeric NOT NULL DEFAULT 1 CHECK (transfer_quantity > 0),
  cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0),
  locked_from_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  outlet_order_visible boolean NOT NULL DEFAULT true,
  image_url text,
  default_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_variants_name_unique ON public.catalog_variants (item_id, (lower(name)));
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_variants_sku_unique ON public.catalog_variants ((lower(sku))) WHERE sku IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_variants' AND column_name = 'uom'
  ) THEN
    ALTER TABLE public.catalog_variants RENAME COLUMN uom TO consumption_uom;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_variants' AND column_name = 'package_contains'
  ) THEN
    ALTER TABLE public.catalog_variants RENAME COLUMN package_contains TO units_per_purchase_pack;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_variants' AND column_name = 'receiving_contains'
  ) THEN
    ALTER TABLE public.catalog_variants RENAME COLUMN receiving_contains TO units_per_purchase_pack;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalog_variants' AND column_name = 'receiving_uom'
  ) THEN
    ALTER TABLE public.catalog_variants RENAME COLUMN receiving_uom TO purchase_pack_unit;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.catalog_variants
  ADD COLUMN IF NOT EXISTS consumption_uom text NOT NULL DEFAULT 'each',
  ADD COLUMN IF NOT EXISTS purchase_pack_unit text NOT NULL DEFAULT 'each',
  ADD COLUMN IF NOT EXISTS units_per_purchase_pack numeric NOT NULL DEFAULT 1 CHECK (units_per_purchase_pack > 0),
  ADD COLUMN IF NOT EXISTS purchase_unit_mass numeric CHECK (purchase_unit_mass IS NULL OR purchase_unit_mass > 0),
  ADD COLUMN IF NOT EXISTS purchase_unit_mass_uom public.qty_unit,
  ADD COLUMN IF NOT EXISTS transfer_unit text NOT NULL DEFAULT 'each',
  ADD COLUMN IF NOT EXISTS transfer_quantity numeric NOT NULL DEFAULT 1 CHECK (transfer_quantity > 0),
  ADD COLUMN IF NOT EXISTS cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0),
  ADD COLUMN IF NOT EXISTS locked_from_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outlet_order_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS default_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_variants_locked_from ON public.catalog_variants(locked_from_warehouse_id);

UPDATE public.catalog_variants cv
SET locked_from_warehouse_id = COALESCE(cv.default_warehouse_id, ci.locked_from_warehouse_id)
FROM public.catalog_items ci
WHERE cv.item_id = ci.id
  AND cv.locked_from_warehouse_id IS NULL
  AND (cv.default_warehouse_id IS NOT NULL OR ci.locked_from_warehouse_id IS NOT NULL);

-- ------------------------------------------------------------
-- Suppliers and sourcing links (ingredient products & variants)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  contact_phone text,
  contact_email text,
  whatsapp_number text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_name_unique ON public.suppliers ((lower(name)));

CREATE TABLE IF NOT EXISTS public.product_supplier_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
  preferred boolean NOT NULL DEFAULT false,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_supplier_item_variant_warehouse
  ON public.product_supplier_links (
    supplier_id,
    item_id,
    COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_product_supplier_links_supplier ON public.product_supplier_links(supplier_id);
CREATE INDEX IF NOT EXISTS idx_product_supplier_links_item ON public.product_supplier_links(item_id);
CREATE INDEX IF NOT EXISTS idx_product_supplier_links_variant ON public.product_supplier_links(variant_id);
CREATE INDEX IF NOT EXISTS idx_product_supplier_links_warehouse ON public.product_supplier_links(warehouse_id);

CREATE OR REPLACE FUNCTION public.suppliers_for_warehouse(p_warehouse_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  contact_name text,
  contact_phone text,
  contact_email text,
  active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT
    s.id,
    s.name,
    s.contact_name,
    s.contact_phone,
    s.contact_email,
    s.active
  FROM public.product_supplier_links psl
  JOIN public.suppliers s ON s.id = psl.supplier_id
  WHERE s.active
    AND psl.active
    AND (
      p_warehouse_id IS NULL
      OR psl.warehouse_id IS NULL
      OR psl.warehouse_id = p_warehouse_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.suppliers_for_warehouse(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suppliers_for_warehouse(uuid) TO anon;

CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_type text NOT NULL CHECK (location_type IN ('warehouse','outlet')),
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  outlet_id uuid REFERENCES public.outlets(id) ON DELETE SET NULL,
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE CASCADE,
  delta_units numeric NOT NULL,
  reason public.stock_reason NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Recipes (finished item -> ingredient list)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_ingredient_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  finished_variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE CASCADE,
  ingredient_item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  source_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  qty_per_unit numeric NOT NULL CHECK (qty_per_unit > 0),
  qty_unit public.qty_unit NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipes_finished ON public.item_ingredient_recipes(finished_item_id, finished_variant_id);
CREATE INDEX IF NOT EXISTS idx_recipes_ingredient ON public.item_ingredient_recipes(ingredient_item_id);

ALTER TABLE IF EXISTS public.item_ingredient_recipes
  ADD COLUMN IF NOT EXISTS source_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recipes_source_warehouse ON public.item_ingredient_recipes(source_warehouse_id);

-- ------------------------------------------------------------
-- Transfer profiles (default rules for inter-warehouse moves)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_transfer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE CASCADE,
  from_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  to_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  transfer_unit text NOT NULL DEFAULT 'each',
  transfer_quantity numeric NOT NULL CHECK (transfer_quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_item_transfer_profile_scope
  ON public.item_transfer_profiles (
    item_id,
    COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    from_warehouse_id,
    to_warehouse_id
  );

CREATE INDEX IF NOT EXISTS idx_item_transfer_profile_from ON public.item_transfer_profiles(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_item_transfer_profile_to ON public.item_transfer_profiles(to_warehouse_id);

-- ------------------------------------------------------------
-- Warehouse handling policies
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_warehouse_handling_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  deduction_uom text NOT NULL DEFAULT 'each',
  recipe_source boolean NOT NULL DEFAULT false,
  damage_unit text NOT NULL DEFAULT 'each',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_item_warehouse_policy_scope
  ON public.item_warehouse_handling_policies (
    warehouse_id,
    item_id,
    COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_item_warehouse_policy_deduction_unit
  ON public.item_warehouse_handling_policies(deduction_uom);

-- ------------------------------------------------------------
-- Warehouse defaults (per stock layer)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouse_defaults_item_variant
  ON public.warehouse_defaults (item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

DO $$
BEGIN
  IF to_regclass('public.outlet_stock_balances') IS NULL AND to_regclass('public.outlet_item_balances') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.outlet_item_balances RENAME TO outlet_stock_balances';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.outlet_stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE CASCADE,
  sent_units numeric NOT NULL DEFAULT 0,
  consumed_units numeric NOT NULL DEFAULT 0,
  on_hand_units numeric GENERATED ALWAYS AS (sent_units - consumed_units) STORED,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP INDEX IF EXISTS public.ux_outlet_item_balances_scope;
DROP INDEX IF EXISTS public.idx_outlet_item_balances_outlet;
DROP INDEX IF EXISTS public.idx_outlet_item_balances_item;

CREATE UNIQUE INDEX IF NOT EXISTS ux_outlet_stock_balances_scope
  ON public.outlet_stock_balances (outlet_id, item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_outlet_stock_balances_outlet ON public.outlet_stock_balances(outlet_id);
CREATE INDEX IF NOT EXISTS idx_outlet_stock_balances_item ON public.outlet_stock_balances(item_id, variant_id);

CREATE TABLE IF NOT EXISTS public.outlet_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE CASCADE,
  qty_units numeric NOT NULL CHECK (qty_units > 0),
  is_production boolean NOT NULL DEFAULT false,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  sold_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outlet_sales_outlet ON public.outlet_sales(outlet_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_outlet_sales_item ON public.outlet_sales(item_id, variant_id);

CREATE TABLE IF NOT EXISTS public.outlet_deduction_mappings (
  outlet_id uuid PRIMARY KEY REFERENCES public.outlets(id) ON DELETE CASCADE,
  target_outlet_id uuid REFERENCES public.outlets(id) ON DELETE CASCADE,
  target_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outlet_deduction_target ON public.outlet_deduction_mappings(target_outlet_id);

CREATE TABLE IF NOT EXISTS public.outlet_stocktakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE CASCADE,
  on_hand_at_snapshot numeric NOT NULL,
  counted_qty numeric NOT NULL,
  variance numeric GENERATED ALWAYS AS (on_hand_at_snapshot - counted_qty) STORED,
  counted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  counted_at timestamptz NOT NULL DEFAULT now(),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outlet_stocktakes_outlet ON public.outlet_stocktakes(outlet_id, counted_at DESC);
CREATE INDEX IF NOT EXISTS idx_outlet_stocktakes_item ON public.outlet_stocktakes(item_id, variant_id);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE RESTRICT,
  order_number text,
  status text NOT NULL DEFAULT 'draft',
  locked boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tz text NOT NULL DEFAULT 'UTC',
  pdf_path text,
  approved_pdf_path text,
  loaded_pdf_path text,
  offloaded_pdf_path text,
  employee_signed_name text,
  employee_signature_path text,
  employee_signed_at timestamptz,
  supervisor_signed_name text,
  supervisor_signature_path text,
  supervisor_signed_at timestamptz,
  driver_signed_name text,
  driver_signature_path text,
  driver_signed_at timestamptz,
  offloader_signed_name text,
  offloader_signature_path text,
  offloader_signed_at timestamptz,
  modified_by_supervisor boolean NOT NULL DEFAULT false,
  modified_by_supervisor_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_outlet ON public.orders(outlet_id, status);

ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tz text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS approved_pdf_path text,
  ADD COLUMN IF NOT EXISTS loaded_pdf_path text,
  ADD COLUMN IF NOT EXISTS offloaded_pdf_path text,
  ADD COLUMN IF NOT EXISTS employee_signed_name text,
  ADD COLUMN IF NOT EXISTS employee_signature_path text,
  ADD COLUMN IF NOT EXISTS employee_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS supervisor_signed_name text,
  ADD COLUMN IF NOT EXISTS supervisor_signature_path text,
  ADD COLUMN IF NOT EXISTS supervisor_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS driver_signed_name text,
  ADD COLUMN IF NOT EXISTS driver_signature_path text,
  ADD COLUMN IF NOT EXISTS driver_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS offloader_signed_name text,
  ADD COLUMN IF NOT EXISTS offloader_signature_path text,
  ADD COLUMN IF NOT EXISTS offloader_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS modified_by_supervisor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS modified_by_supervisor_name text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_order_number ON public.orders(order_number) WHERE order_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  variation_id uuid REFERENCES public.catalog_variants(id) ON DELETE RESTRICT,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  name text,
  consumption_uom text NOT NULL DEFAULT 'each',
  receiving_uom text NOT NULL DEFAULT 'each',
  cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0),
  receiving_contains numeric,
  qty_cases numeric,
  amount numeric,
  qty numeric NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_item ON public.order_items(product_id, variation_id);

CREATE TABLE IF NOT EXISTS public.outlet_order_counters (
  outlet_id uuid PRIMARY KEY REFERENCES public.outlets(id) ON DELETE CASCADE,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'uom'
  ) THEN
    ALTER TABLE public.order_items RENAME COLUMN uom TO consumption_uom;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'package_contains'
  ) THEN
    ALTER TABLE public.order_items RENAME COLUMN package_contains TO receiving_contains;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.order_items
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS consumption_uom text NOT NULL DEFAULT 'each',
  ADD COLUMN IF NOT EXISTS receiving_uom text NOT NULL DEFAULT 'each',
  ADD COLUMN IF NOT EXISTS cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0),
  ADD COLUMN IF NOT EXISTS receiving_contains numeric,
  ADD COLUMN IF NOT EXISTS qty_cases numeric,
  ADD COLUMN IF NOT EXISTS amount numeric;

-- ------------------------------------------------------------
-- Stock ledger normalization (single history table)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_ledger' AND column_name = 'product_id'
  ) THEN
    ALTER TABLE public.stock_ledger RENAME COLUMN product_id TO item_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_ledger' AND column_name = 'variation_id'
  ) THEN
    ALTER TABLE public.stock_ledger RENAME COLUMN variation_id TO variant_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_ledger' AND column_name = 'qty_change'
  ) THEN
    ALTER TABLE public.stock_ledger RENAME COLUMN qty_change TO delta_units;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_ledger' AND column_name = 'context'
  ) THEN
    ALTER TABLE public.stock_ledger ADD COLUMN context jsonb;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Functions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.outlet_auth_user_matches(p_outlet_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin(p_user_id) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.outlets o
    WHERE o.id = p_outlet_id AND o.auth_user_id = p_user_id AND o.active
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.member_outlet_ids(p_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path TO 'pg_temp'
AS $$
  SELECT COALESCE(
    CASE
      WHEN p_user_id IS NULL THEN NULL
      WHEN public.is_admin(p_user_id) THEN (SELECT array_agg(id) FROM public.outlets)
      ELSE (SELECT array_agg(id) FROM public.outlets o WHERE o.auth_user_id = p_user_id AND o.active)
    END,
    '{}'
  );
$$;

CREATE OR REPLACE FUNCTION public.member_outlet_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path TO 'pg_temp'
AS $$
  SELECT unnest(COALESCE(public.member_outlet_ids(auth.uid()), ARRAY[]::uuid[]));
$$;

CREATE OR REPLACE FUNCTION public.default_outlet_id(p_user uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'pg_temp'
AS $$
  SELECT (public.member_outlet_ids(COALESCE(p_user, (select auth.uid()))))[1];
$$;

CREATE OR REPLACE FUNCTION public.console_operator_directory()
RETURNS TABLE(
  id uuid,
  display_name text,
  name text,
  email text,
  auth_user_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT
    u.id,
    COALESCE(ur.display_name, u.raw_user_meta_data->>'display_name', u.email, 'Operator') AS display_name,
    COALESCE(ur.display_name, u.raw_user_meta_data->>'display_name', u.email, 'Operator') AS name,
    u.email,
    u.id AS auth_user_id
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role_id = 'eef421e0-ce06-4518-93c4-6bb6525f6742'
    AND (u.is_anonymous IS NULL OR u.is_anonymous = false)
    AND u.email IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.console_operator_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.console_operator_directory() TO anon;

CREATE OR REPLACE FUNCTION public.console_locked_warehouses(
  p_include_inactive boolean DEFAULT false,
  p_locked_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name text,
  parent_warehouse_id uuid,
  kind text,
  active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ids uuid[] := ARRAY(SELECT DISTINCT unnest(COALESCE(p_locked_ids, ARRAY[]::uuid[])));
BEGIN
  RETURN QUERY
  SELECT w.id, w.name, w.parent_warehouse_id, w.kind, w.active
  FROM public.warehouses w
  WHERE p_include_inactive
        OR w.active
        OR (array_length(ids, 1) IS NOT NULL AND w.id = ANY(ids));
END;
$$;

GRANT EXECUTE ON FUNCTION public.console_locked_warehouses(boolean, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.console_locked_warehouses(boolean, uuid[]) TO anon;

CREATE OR REPLACE FUNCTION public.refresh_catalog_has_variations(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_item_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.catalog_items ci
  SET has_variations = EXISTS (
        SELECT 1 FROM public.catalog_variants v
      WHERE v.item_id = ci.id AND v.active AND v.outlet_order_visible
      ),
      updated_at = now()
  WHERE ci.id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_variants_flag_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new uuid;
  v_old uuid;
BEGIN
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.item_id ELSE NULL END;
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.item_id ELSE NULL END;

  IF v_new IS NOT NULL THEN
    PERFORM public.refresh_catalog_has_variations(v_new);
  END IF;
  IF v_old IS NOT NULL AND (v_new IS NULL OR v_old <> v_new) THEN
    PERFORM public.refresh_catalog_has_variations(v_old);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_variants_flag_sync ON public.catalog_variants;
CREATE TRIGGER trg_catalog_variants_flag_sync
AFTER INSERT OR UPDATE OR DELETE ON public.catalog_variants
FOR EACH ROW EXECUTE FUNCTION public.catalog_variants_flag_sync();

UPDATE public.catalog_items ci
  SET has_variations = EXISTS (
  SELECT 1 FROM public.catalog_variants v
  WHERE v.item_id = ci.id AND v.active AND v.outlet_order_visible
);

CREATE OR REPLACE FUNCTION public.whoami_outlet()
RETURNS TABLE(outlet_id uuid, outlet_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT o.id, o.name
  FROM public.outlets o
  WHERE o.active AND o.auth_user_id = v_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.whoami_roles()
RETURNS TABLE(
  user_id uuid,
  email text,
  is_admin boolean,
  roles text[],
  outlets jsonb,
  role_catalog jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_is_admin boolean := false;
  v_roles text[] := ARRAY[]::text[];
  v_outlets jsonb := '[]'::jsonb;
  v_role_catalog jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  v_is_admin := EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = v_uid);

  SELECT COALESCE(jsonb_agg(to_jsonb(r) - 'description' - 'active' - 'created_at'), '[]'::jsonb)
    INTO v_role_catalog
  FROM (
    SELECT id, slug, normalized_slug, display_name
    FROM public.roles
    WHERE active
    ORDER BY display_name
  ) r;

  SELECT COALESCE(array_agg(DISTINCT COALESCE(r.slug, r.display_name)), ARRAY[]::text[])
    INTO v_roles
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_uid AND ur.outlet_id IS NULL;

  IF v_is_admin THEN
    v_roles := array_append(v_roles, 'admin');
  END IF;

  WITH raw_outlets AS (
    SELECT o.id,
           o.name,
           TRUE AS via_auth_mapping
    FROM public.outlets o
    WHERE o.active AND o.auth_user_id = v_uid

    UNION ALL

    SELECT o.id,
           o.name,
           FALSE AS via_auth_mapping
    FROM public.user_roles ur
    JOIN public.outlets o ON o.id = ur.outlet_id
    WHERE ur.user_id = v_uid AND o.active
  ),
  outlet_sources AS (
    SELECT id,
           name,
           bool_or(via_auth_mapping) AS via_auth_mapping
    FROM raw_outlets
    GROUP BY id, name
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'outlet_id', src.id,
        'outlet_name', src.name,
        'roles', (
          SELECT COALESCE(array_agg(DISTINCT COALESCE(r.slug, r.display_name)), ARRAY[]::text[])
          FROM public.user_roles ur2
          JOIN public.roles r ON r.id = ur2.role_id
          WHERE ur2.user_id = v_uid AND ur2.outlet_id = src.id
        ) || CASE WHEN src.via_auth_mapping THEN ARRAY['Outlet']::text[] ELSE ARRAY[]::text[] END
      )
    ),
    '[]'::jsonb
  ) INTO v_outlets
  FROM outlet_sources src;

  RETURN QUERY SELECT v_uid, v_email, v_is_admin, v_roles, v_outlets, v_role_catalog;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_order_number(p_outlet_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix text;
  v_next bigint;
BEGIN
  IF p_outlet_id IS NULL THEN
    RAISE EXCEPTION 'outlet id required for numbering';
  END IF;

  INSERT INTO public.outlet_order_counters(outlet_id, last_value)
  VALUES (p_outlet_id, 1)
  ON CONFLICT (outlet_id)
  DO UPDATE SET last_value = public.outlet_order_counters.last_value + 1,
                updated_at = now()
  RETURNING last_value INTO v_next;

  SELECT COALESCE(NULLIF(o.code, ''), substr(o.id::text, 1, 4)) INTO v_prefix
  FROM public.outlets o
  WHERE o.id = p_outlet_id;

  v_prefix := COALESCE(v_prefix, 'OUT');
  v_prefix := upper(regexp_replace(v_prefix, '[^A-Za-z0-9]', '', 'g'));
  RETURN v_prefix || '-' || lpad(v_next::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_modified(
  p_order_id uuid,
  p_supervisor_name text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.orders
  SET modified_by_supervisor = true,
      modified_by_supervisor_name = COALESCE(NULLIF(p_supervisor_name, ''), modified_by_supervisor_name),
      updated_at = now()
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_recipe_deductions(
  p_item_id uuid,
  p_qty_units numeric,
  p_warehouse_id uuid,
  p_variant_id uuid DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
BEGIN
  IF p_item_id IS NULL OR p_qty_units IS NULL OR p_qty_units <= 0 THEN
    RAISE EXCEPTION 'item + qty required for recipe deductions';
  END IF;

  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'warehouse required for recipe deductions';
  END IF;

  FOR rec IN
    SELECT ingredient_item_id, qty_per_unit
    FROM public.item_ingredient_recipes
    WHERE finished_item_id = p_item_id
      AND (finished_variant_id IS NULL OR finished_variant_id = p_variant_id)
      AND active
  LOOP
    INSERT INTO public.stock_ledger(
      location_type,
      warehouse_id,
      item_id,
      variant_id,
      delta_units,
      reason,
      context
    ) VALUES (
      'warehouse',
      p_warehouse_id,
      rec.ingredient_item_id,
      NULL,
      -1 * (p_qty_units * rec.qty_per_unit),
      'recipe_consumption',
      jsonb_build_object('recipe_for', p_item_id, 'qty_units', p_qty_units) || coalesce(p_context, '{}')
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_outlet_sale(
  p_outlet_id uuid,
  p_item_id uuid,
  p_qty_units numeric,
  p_variant_id uuid DEFAULT NULL,
  p_is_production boolean DEFAULT false,
  p_warehouse_id uuid DEFAULT NULL,
  p_sold_at timestamptz DEFAULT now(),
  p_context jsonb DEFAULT '{}'::jsonb
) RETURNS public.outlet_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale public.outlet_sales%ROWTYPE;
  v_map record;
  v_deduct_outlet uuid;
  v_deduct_wh uuid;
BEGIN
  IF p_outlet_id IS NULL OR p_item_id IS NULL OR p_qty_units IS NULL OR p_qty_units <= 0 THEN
    RAISE EXCEPTION 'outlet, item, qty required';
  END IF;

  SELECT outlet_id, target_outlet_id, target_warehouse_id INTO v_map
  FROM public.outlet_deduction_mappings
  WHERE outlet_id = p_outlet_id;

  v_deduct_outlet := coalesce(v_map.target_outlet_id, p_outlet_id);
  v_deduct_wh := coalesce(p_warehouse_id, v_map.target_warehouse_id);

  INSERT INTO public.outlet_sales(
    outlet_id, item_id, variant_id, qty_units, is_production, warehouse_id, sold_at, created_by, context
  ) VALUES (
    p_outlet_id, p_item_id, p_variant_id, p_qty_units, coalesce(p_is_production, false), p_warehouse_id, p_sold_at, auth.uid(), p_context
  ) RETURNING * INTO v_sale;

  INSERT INTO public.outlet_stock_balances(outlet_id, item_id, variant_id, sent_units, consumed_units)
  VALUES (p_outlet_id, p_item_id, p_variant_id, 0, p_qty_units)
  ON CONFLICT (outlet_id, item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET
    consumed_units = public.outlet_stock_balances.consumed_units + EXCLUDED.consumed_units,
    updated_at = now();

  IF coalesce(p_is_production, false) THEN
    PERFORM public.apply_recipe_deductions(
      p_item_id,
      p_qty_units,
      v_deduct_wh,
      p_variant_id,
      jsonb_build_object('source', 'outlet_sale', 'outlet_id', p_outlet_id, 'deduct_outlet_id', v_deduct_outlet, 'sale_id', v_sale.id)
    );
  END IF;

  RETURN v_sale;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_order_fulfillment(
  p_order_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  oi record;
  v_order public.orders%ROWTYPE;
  v_wh uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  FOR oi IN
    SELECT oi.id, oi.order_id, oi.product_id AS item_id, oi.variation_id AS variant_id, oi.qty, oi.warehouse_id
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.qty > 0
  LOOP
    v_wh := coalesce(oi.warehouse_id, (
      SELECT wd.warehouse_id FROM public.warehouse_defaults wd
      WHERE wd.item_id = oi.item_id AND (wd.variant_id IS NULL OR wd.variant_id = oi.variant_id)
      ORDER BY wd.variant_id NULLS LAST LIMIT 1
    ));

    IF v_wh IS NULL THEN
      RAISE EXCEPTION 'no warehouse mapping for item %', oi.item_id;
    END IF;

    INSERT INTO public.stock_ledger(location_type, warehouse_id, item_id, variant_id, delta_units, reason, context)
    VALUES ('warehouse', v_wh, oi.item_id, oi.variant_id, -1 * oi.qty, 'order_fulfillment', jsonb_build_object('order_id', p_order_id, 'order_item_id', oi.id));

    INSERT INTO public.outlet_stock_balances(outlet_id, item_id, variant_id, sent_units, consumed_units)
    VALUES (v_order.outlet_id, oi.item_id, oi.variant_id, oi.qty, 0)
    ON CONFLICT (outlet_id, item_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET sent_units = public.outlet_stock_balances.sent_units + EXCLUDED.sent_units,
                  updated_at = now();
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.order_is_accessible(
  p_order_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_outlet uuid;
BEGIN
  IF p_order_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT outlet_id INTO target_outlet FROM public.orders WHERE id = p_order_id;
  IF target_outlet IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin(p_user_id) THEN
    RETURN true;
  END IF;

  RETURN (
    target_outlet = ANY(COALESCE(public.member_outlet_ids(p_user_id), ARRAY[]::uuid[]))
    OR public.outlet_auth_user_matches(target_outlet, p_user_id)
  );
END;
$$;

-- ------------------------------------------------------------
-- Warehouse ledgered actions (transfer, damage, purchase receipts)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_transfer_counters (
  id integer PRIMARY KEY DEFAULT 1,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.warehouse_transfer_counters(id, last_value)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.next_transfer_reference()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next bigint;
BEGIN
  INSERT INTO public.warehouse_transfer_counters(id, last_value)
  VALUES (1, 1)
  ON CONFLICT (id)
  DO UPDATE SET last_value = public.warehouse_transfer_counters.last_value + 1,
                updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN 'WT-' || lpad(v_next::text, 6, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.warehouse_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code text NOT NULL,
  source_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  destination_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  note text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouse_transfers_reference ON public.warehouse_transfers(reference_code);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_source ON public.warehouse_transfers(source_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_destination ON public.warehouse_transfers(destination_warehouse_id);

CREATE TABLE IF NOT EXISTS public.warehouse_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.warehouse_transfers(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE RESTRICT,
  qty_units numeric NOT NULL CHECK (qty_units > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON public.warehouse_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_item ON public.warehouse_transfer_items(item_id, variant_id);

CREATE OR REPLACE FUNCTION public.transfer_units_between_warehouses(
  p_source uuid,
  p_destination uuid,
  p_items jsonb,
  p_note text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  v_transfer_id uuid;
  v_reference text;
BEGIN
  IF p_source IS NULL OR p_destination IS NULL THEN
    RAISE EXCEPTION 'source and destination are required';
  END IF;

  IF p_source = p_destination THEN
    RAISE EXCEPTION 'source and destination cannot match';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'at least one line item is required';
  END IF;

  v_reference := public.next_transfer_reference();

  INSERT INTO public.warehouse_transfers(
    reference_code,
    source_warehouse_id,
    destination_warehouse_id,
    note,
    context,
    created_by
  ) VALUES (
    v_reference,
    p_source,
    p_destination,
    p_note,
    coalesce(p_items, '[]'::jsonb),
    auth.uid()
  ) RETURNING id INTO v_transfer_id;

  FOR rec IN
    SELECT
      (elem->>'product_id')::uuid AS item_id,
      NULLIF(elem->>'variation_id', '')::uuid AS variant_id,
      (elem->>'qty')::numeric AS qty_units
    FROM jsonb_array_elements(p_items) elem
  LOOP
    IF rec.item_id IS NULL OR rec.qty_units IS NULL OR rec.qty_units <= 0 THEN
      RAISE EXCEPTION 'each line needs product_id and qty > 0';
    END IF;

    INSERT INTO public.warehouse_transfer_items(transfer_id, item_id, variant_id, qty_units)
    VALUES (v_transfer_id, rec.item_id, rec.variant_id, rec.qty_units);

    INSERT INTO public.stock_ledger(location_type, warehouse_id, item_id, variant_id, delta_units, reason, context)
    VALUES (
      'warehouse',
      p_source,
      rec.item_id,
      rec.variant_id,
      -1 * rec.qty_units,
      'warehouse_transfer',
      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'out')
    );

    INSERT INTO public.stock_ledger(location_type, warehouse_id, item_id, variant_id, delta_units, reason, context)
    VALUES (
      'warehouse',
      p_destination,
      rec.item_id,
      rec.variant_id,
      rec.qty_units,
      'warehouse_transfer',
      jsonb_build_object('transfer_id', v_transfer_id, 'reference_code', v_reference, 'direction', 'in')
    );
  END LOOP;

  RETURN v_reference;
END;
$$;

CREATE TABLE IF NOT EXISTS public.warehouse_damages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  note text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_damages_warehouse ON public.warehouse_damages(warehouse_id);

CREATE TABLE IF NOT EXISTS public.warehouse_damage_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  damage_id uuid NOT NULL REFERENCES public.warehouse_damages(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE RESTRICT,
  qty_units numeric NOT NULL CHECK (qty_units > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_damage_items_damage ON public.warehouse_damage_items(damage_id);
CREATE INDEX IF NOT EXISTS idx_damage_items_item ON public.warehouse_damage_items(item_id, variant_id);

CREATE OR REPLACE FUNCTION public.record_damage(
  p_warehouse_id uuid,
  p_items jsonb,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  v_damage_id uuid;
BEGIN
  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'warehouse_id is required';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'at least one damage line is required';
  END IF;

  INSERT INTO public.warehouse_damages(warehouse_id, note, context, created_by)
  VALUES (p_warehouse_id, p_note, coalesce(p_items, '[]'::jsonb), auth.uid())
  RETURNING id INTO v_damage_id;

  FOR rec IN
    SELECT
      (elem->>'product_id')::uuid AS item_id,
      NULLIF(elem->>'variation_id', '')::uuid AS variant_id,
      (elem->>'qty')::numeric AS qty_units,
      NULLIF(elem->>'note', '') AS line_note
    FROM jsonb_array_elements(p_items) elem
  LOOP
    IF rec.item_id IS NULL OR rec.qty_units IS NULL OR rec.qty_units <= 0 THEN
      RAISE EXCEPTION 'each damage line needs product_id and qty > 0';
    END IF;

    INSERT INTO public.warehouse_damage_items(damage_id, item_id, variant_id, qty_units, note)
    VALUES (v_damage_id, rec.item_id, rec.variant_id, rec.qty_units, rec.line_note);

    INSERT INTO public.stock_ledger(location_type, warehouse_id, item_id, variant_id, delta_units, reason, context)
    VALUES (
      'warehouse',
      p_warehouse_id,
      rec.item_id,
      rec.variant_id,
      -1 * rec.qty_units,
      'damage',
      jsonb_build_object('damage_id', v_damage_id, 'note', coalesce(rec.line_note, p_note))
    );
  END LOOP;

  RETURN v_damage_id;
END;
$$;

CREATE TABLE IF NOT EXISTS public.warehouse_purchase_receipt_counters (
  id integer PRIMARY KEY DEFAULT 1,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.warehouse_purchase_receipt_counters(id, last_value)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.next_purchase_receipt_reference()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next bigint;
BEGIN
  INSERT INTO public.warehouse_purchase_receipt_counters(id, last_value)
  VALUES (1, 1)
  ON CONFLICT (id)
  DO UPDATE SET last_value = public.warehouse_purchase_receipt_counters.last_value + 1,
                updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN 'PR-' || lpad(v_next::text, 6, '0');
END;
$$;

CREATE TABLE IF NOT EXISTS public.warehouse_purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  reference_code text NOT NULL,
  note text,
  auto_whatsapp boolean NOT NULL DEFAULT false,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_purchase_receipts_reference_per_warehouse
  ON public.warehouse_purchase_receipts(warehouse_id, reference_code);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_supplier ON public.warehouse_purchase_receipts(supplier_id);

CREATE TABLE IF NOT EXISTS public.warehouse_purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.warehouse_purchase_receipts(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES public.catalog_variants(id) ON DELETE RESTRICT,
  qty_units numeric NOT NULL CHECK (qty_units > 0),
  qty_input_mode text NOT NULL DEFAULT 'units',
  unit_cost numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_receipt ON public.warehouse_purchase_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_item ON public.warehouse_purchase_items(item_id, variant_id);

CREATE OR REPLACE FUNCTION public.record_purchase_receipt(
  p_warehouse_id uuid,
  p_items jsonb,
  p_supplier_id uuid DEFAULT NULL,
  p_reference_code text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_auto_whatsapp boolean DEFAULT false
) RETURNS public.warehouse_purchase_receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  v_receipt public.warehouse_purchase_receipts%ROWTYPE;
  v_reference text;
BEGIN
  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'warehouse_id is required';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'at least one purchase item is required';
  END IF;

  v_reference := COALESCE(NULLIF(p_reference_code, ''), public.next_purchase_receipt_reference());

  INSERT INTO public.warehouse_purchase_receipts(
    warehouse_id,
    supplier_id,
    reference_code,
    note,
    auto_whatsapp,
    context,
    recorded_by
  ) VALUES (
    p_warehouse_id,
    p_supplier_id,
    v_reference,
    p_note,
    coalesce(p_auto_whatsapp, false),
    coalesce(p_items, '[]'::jsonb),
    auth.uid()
  ) RETURNING * INTO v_receipt;

  FOR rec IN
    SELECT
      (elem->>'product_id')::uuid AS item_id,
      NULLIF(elem->>'variation_id', '')::uuid AS variant_id,
      (elem->>'qty')::numeric AS qty_units,
      COALESCE(NULLIF(elem->>'qty_input_mode', ''), 'units') AS qty_input_mode,
      NULLIF(elem->>'unit_cost', '')::numeric AS unit_cost
    FROM jsonb_array_elements(p_items) elem
  LOOP
    IF rec.item_id IS NULL OR rec.qty_units IS NULL OR rec.qty_units <= 0 THEN
      RAISE EXCEPTION 'each purchase line needs product_id and qty > 0';
    END IF;

    INSERT INTO public.warehouse_purchase_items(
      receipt_id,
      item_id,
      variant_id,
      qty_units,
      qty_input_mode,
      unit_cost
    ) VALUES (
      v_receipt.id,
      rec.item_id,
      rec.variant_id,
      rec.qty_units,
      rec.qty_input_mode,
      rec.unit_cost
    );

    INSERT INTO public.stock_ledger(location_type, warehouse_id, item_id, variant_id, delta_units, reason, context)
    VALUES (
      'warehouse',
      p_warehouse_id,
      rec.item_id,
      rec.variant_id,
      rec.qty_units,
      'purchase_receipt',
      jsonb_build_object('receipt_id', v_receipt.id, 'reference_code', v_receipt.reference_code, 'supplier_id', p_supplier_id)
    );
  END LOOP;

  RETURN v_receipt;
END;
$$;

-- ------------------------------------------------------------
-- Storage buckets (orders PDFs + signatures)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage.buckets not found; skipping bucket bootstrap';
  ELSE
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    SELECT 'orders', 'orders', true, NULL::bigint, ARRAY['application/pdf']::text[]
    WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'orders');

    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    SELECT 'signatures', 'signatures', true, NULL::bigint, ARRAY['image/png','image/jpeg']::text[]
    WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'signatures');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects not found; skipping storage policy bootstrap';
    RETURN;
  END IF;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "insert_orders_by_outlet_prefix" ON storage.objects';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "insert_signatures_by_outlet_prefix" ON storage.objects';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  EXECUTE $policy$
    CREATE POLICY "insert_orders_by_outlet_prefix"
    ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'orders'
      AND (
        public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM unnest(public.member_outlet_ids(auth.uid())) AS oid
          WHERE path_tokens[1] = oid::text
        )
      )
      AND name ~ '^[0-9a-fA-F-]+/.+'
    );
  $policy$;

  EXECUTE $policy$
    CREATE POLICY "insert_signatures_by_outlet_prefix"
    ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'signatures'
      AND (
        public.is_admin(auth.uid())
        OR EXISTS (
          SELECT 1 FROM unnest(public.member_outlet_ids(auth.uid())) AS oid
          WHERE path_tokens[1] = oid::text
        )
      )
      AND name ~ '^[0-9a-fA-F-]+/.+'
    );
  $policy$;
END $$;

-- ------------------------------------------------------------
-- Reporting views (outlet + warehouse layer summaries)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.outlet_stock_summary AS
SELECT
  osb.outlet_id,
  osb.item_id,
  ci.name AS item_name,
  osb.variant_id,
  cv.name AS variant_name,
  osb.sent_units,
  osb.consumed_units,
  osb.on_hand_units
FROM public.outlet_stock_balances osb
LEFT JOIN public.catalog_items ci ON ci.id = osb.item_id
LEFT JOIN public.catalog_variants cv ON cv.id = osb.variant_id;

CREATE OR REPLACE VIEW public.warehouse_layer_stock AS
SELECT
  w.id AS warehouse_id,
  w.stock_layer,
  sl.item_id,
  ci.name AS item_name,
  sl.variant_id,
  cv.name AS variant_name,
  SUM(sl.delta_units) AS net_units
FROM public.stock_ledger sl
JOIN public.warehouses w ON w.id = sl.warehouse_id
LEFT JOIN public.catalog_items ci ON ci.id = sl.item_id
LEFT JOIN public.catalog_variants cv ON cv.id = sl.variant_id
WHERE sl.location_type = 'warehouse'
GROUP BY w.id, w.stock_layer, sl.item_id, ci.name, sl.variant_id, cv.name;

-- ------------------------------------------------------------
-- Policies
-- ------------------------------------------------------------
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_ingredient_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_deduction_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_damages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_damage_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_purchase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalog_items_admin_rw ON public.catalog_items;
CREATE POLICY catalog_items_admin_rw ON public.catalog_items FOR ALL TO public USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS catalog_items_select_active ON public.catalog_items;
CREATE POLICY catalog_items_select_active ON public.catalog_items
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND active);

DROP POLICY IF EXISTS catalog_variants_admin_rw ON public.catalog_variants;
CREATE POLICY catalog_variants_admin_rw ON public.catalog_variants FOR ALL TO public USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS catalog_variants_select_active ON public.catalog_variants;
CREATE POLICY catalog_variants_select_active ON public.catalog_variants
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND active);

DROP POLICY IF EXISTS item_recipes_admin_rw ON public.item_ingredient_recipes;
CREATE POLICY item_recipes_admin_rw ON public.item_ingredient_recipes FOR ALL TO public USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS warehouse_defaults_admin_rw ON public.warehouse_defaults;
CREATE POLICY warehouse_defaults_admin_rw ON public.warehouse_defaults FOR ALL TO public USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS outlet_stock_balances_admin_rw ON public.outlet_stock_balances;
CREATE POLICY outlet_stock_balances_admin_rw ON public.outlet_stock_balances FOR ALL TO public USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS outlet_sales_admin_rw ON public.outlet_sales;
CREATE POLICY outlet_sales_admin_rw ON public.outlet_sales FOR ALL TO public USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS outlet_deduction_mappings_admin_rw ON public.outlet_deduction_mappings;
CREATE POLICY outlet_deduction_mappings_admin_rw ON public.outlet_deduction_mappings FOR ALL TO public USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS outlet_sales_insert_ops ON public.outlet_sales;
CREATE POLICY outlet_sales_insert_ops ON public.outlet_sales FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS outlet_stock_balances_ro ON public.outlet_stock_balances;
CREATE POLICY outlet_stock_balances_ro ON public.outlet_stock_balances FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS outlet_balances_scoped ON public.outlet_stock_balances;
CREATE POLICY outlet_balances_scoped ON public.outlet_stock_balances
  FOR ALL TO authenticated
  USING (public.outlet_auth_user_matches(outlet_id, auth.uid()))
  WITH CHECK (public.outlet_auth_user_matches(outlet_id, auth.uid()));

DROP POLICY IF EXISTS outlet_stocktakes_admin_rw ON public.outlet_stocktakes;
CREATE POLICY outlet_stocktakes_admin_rw ON public.outlet_stocktakes FOR ALL TO public USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS outlet_stocktakes_ro ON public.outlet_stocktakes;
CREATE POLICY outlet_stocktakes_ro ON public.outlet_stocktakes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS outlet_stocktakes_scoped ON public.outlet_stocktakes;
CREATE POLICY outlet_stocktakes_scoped ON public.outlet_stocktakes
  FOR ALL TO authenticated
  USING (public.outlet_auth_user_matches(outlet_id, auth.uid()))
  WITH CHECK (public.outlet_auth_user_matches(outlet_id, auth.uid()));

DROP POLICY IF EXISTS outlet_sales_scoped ON public.outlet_sales;
CREATE POLICY outlet_sales_scoped ON public.outlet_sales
  FOR ALL TO authenticated
  USING (public.outlet_auth_user_matches(outlet_id, auth.uid()))
  WITH CHECK (public.outlet_auth_user_matches(outlet_id, auth.uid()));

DROP POLICY IF EXISTS warehouses_admin_rw ON public.warehouses;
CREATE POLICY warehouses_admin_rw ON public.warehouses
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS warehouses_select_scoped ON public.warehouses;
CREATE POLICY warehouses_select_scoped ON public.warehouses
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS outlets_admin_rw ON public.outlets;
CREATE POLICY outlets_admin_rw ON public.outlets
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS outlets_select_scoped ON public.outlets;
CREATE POLICY outlets_select_scoped ON public.outlets
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR id = ANY(public.member_outlet_ids(auth.uid()))
  );

DROP POLICY IF EXISTS outlet_order_counters_admin_rw ON public.outlet_order_counters;
CREATE POLICY outlet_order_counters_admin_rw ON public.outlet_order_counters
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS platform_admins_admin_rw ON public.platform_admins;
CREATE POLICY platform_admins_admin_rw ON public.platform_admins
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS platform_admins_self_select ON public.platform_admins;
CREATE POLICY platform_admins_self_select ON public.platform_admins
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR user_id = auth.uid());

DROP POLICY IF EXISTS roles_admin_rw ON public.roles;
CREATE POLICY roles_admin_rw ON public.roles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS roles_select_all ON public.roles;
CREATE POLICY roles_select_all ON public.roles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS user_roles_admin_rw ON public.user_roles;
CREATE POLICY user_roles_admin_rw ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS user_roles_self_select ON public.user_roles;
CREATE POLICY user_roles_self_select ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR user_id = auth.uid());

DROP POLICY IF EXISTS stock_ledger_admin_rw ON public.stock_ledger;
CREATE POLICY stock_ledger_admin_rw ON public.stock_ledger
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS warehouse_transfers_admin_rw ON public.warehouse_transfers;
CREATE POLICY warehouse_transfers_admin_rw ON public.warehouse_transfers
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS warehouse_transfer_items_admin_rw ON public.warehouse_transfer_items;
CREATE POLICY warehouse_transfer_items_admin_rw ON public.warehouse_transfer_items
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS warehouse_damages_admin_rw ON public.warehouse_damages;
CREATE POLICY warehouse_damages_admin_rw ON public.warehouse_damages
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS warehouse_damage_items_admin_rw ON public.warehouse_damage_items;
CREATE POLICY warehouse_damage_items_admin_rw ON public.warehouse_damage_items
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS warehouse_purchase_receipts_admin_rw ON public.warehouse_purchase_receipts;
CREATE POLICY warehouse_purchase_receipts_admin_rw ON public.warehouse_purchase_receipts
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS warehouse_purchase_items_admin_rw ON public.warehouse_purchase_items;
CREATE POLICY warehouse_purchase_items_admin_rw ON public.warehouse_purchase_items
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Consolidated RLS for orders + order_items
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Drop legacy policies on orders
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_select_access ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_select_member_outlets ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_select_admin_all ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_outlet_rw ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_insert_outlet_or_admin ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_update_admin_only ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_policy_select ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_policy_insert ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_policy_update ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS orders_policy_delete ON public.orders'; EXCEPTION WHEN undefined_object THEN NULL; END;

  -- Create consolidated policies for orders
  EXECUTE $orders$
    CREATE POLICY orders_policy_select
    ON public.orders
    FOR SELECT TO authenticated
    USING (
      public.is_admin((select auth.uid()))
      OR outlet_id = ANY (public.member_outlet_ids((select auth.uid())))
    );
  $orders$;

  EXECUTE $orders$
    CREATE POLICY orders_policy_insert
    ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (
      public.is_admin((select auth.uid()))
      OR outlet_id = ANY (public.member_outlet_ids((select auth.uid())))
    );
  $orders$;

  EXECUTE $orders$
    CREATE POLICY orders_policy_update
    ON public.orders
    FOR UPDATE TO authenticated
    USING (public.is_admin((select auth.uid())))
    WITH CHECK (public.is_admin((select auth.uid())));
  $orders$;

  EXECUTE $orders$
    CREATE POLICY orders_policy_delete
    ON public.orders
    FOR DELETE TO authenticated
    USING (public.is_admin((select auth.uid())));
  $orders$;

  -- Drop any existing order_items policies
  BEGIN EXECUTE 'DROP POLICY IF EXISTS supervisor_update_qty_only ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_select_access ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_select_member_outlets ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_select_admin_all ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_insert_access ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_update_supervisor_or_admin ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_update_supervisor_admin ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_delete_admin_only ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_outlet_rw ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_policy_select ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_policy_insert ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_policy_update ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN EXECUTE 'DROP POLICY IF EXISTS order_items_policy_delete ON public.order_items'; EXCEPTION WHEN undefined_object THEN NULL; END;

  EXECUTE $order_items$
    CREATE POLICY order_items_policy_select
    ON public.order_items
    FOR SELECT TO authenticated
    USING (public.order_is_accessible(order_id, (select auth.uid())));
  $order_items$;

  EXECUTE $order_items$
    CREATE POLICY order_items_policy_insert
    ON public.order_items
    FOR INSERT TO authenticated
    WITH CHECK (public.order_is_accessible(order_id, (select auth.uid())));
  $order_items$;

  EXECUTE $order_items$
    CREATE POLICY order_items_policy_update
    ON public.order_items
    FOR UPDATE TO authenticated
    USING (public.order_is_accessible(order_id, (select auth.uid())))
    WITH CHECK (public.order_is_accessible(order_id, (select auth.uid())));
  $order_items$;

  EXECUTE $order_items$
    CREATE POLICY order_items_policy_delete
    ON public.order_items
    FOR DELETE TO authenticated
    USING (public.is_admin((select auth.uid())));
  $order_items$;
END
$$;

-- Ensure Supabase Realtime publication tracks the core tables the app subscribes to
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'orders',
    'order_items',
    'outlets',
    'warehouses',
    'outlet_stock_balances',
    'outlet_sales',
    'stock_ledger'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    EXECUTE 'CREATE PUBLICATION supabase_realtime';
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind IN ('r','p')
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', 'public', t);
    END IF;
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- Legacy cleanup (drops old parallel tables/views)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.outlet_product_order_totals CASCADE;
DROP VIEW IF EXISTS public.order_pack_consumption CASCADE;
DROP VIEW IF EXISTS public.variances_sold CASCADE;
DROP VIEW IF EXISTS public.outlet_order_log CASCADE;
DROP VIEW IF EXISTS public.outlet_stock_current CASCADE;
DROP VIEW IF EXISTS public.warehouse_stock_current CASCADE;
DROP VIEW IF EXISTS public.warehouse_group_stock_current CASCADE;

DROP TABLE IF EXISTS public.product_recipes CASCADE;
DROP TABLE IF EXISTS public.product_recipe_ingredients CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.product_variations CASCADE;
DROP TABLE IF EXISTS public.products_sold CASCADE;
DROP TABLE IF EXISTS public.pos_sales CASCADE;
DROP TABLE IF EXISTS public.warehouse_stock_entries CASCADE;
DROP TABLE IF EXISTS public.warehouse_stock_entry_events CASCADE;
DROP TABLE IF EXISTS public.damages CASCADE;
DROP TABLE IF EXISTS public.outlet_stock_periods CASCADE;
DROP TABLE IF EXISTS public.stock_movements CASCADE;
DROP TABLE IF EXISTS public.stock_movement_items CASCADE;
DROP TABLE IF EXISTS public.warehouse_stocktakes CASCADE;
DROP TABLE IF EXISTS public.console_operators CASCADE;
DROP TABLE IF EXISTS public.assets CASCADE;

DROP TYPE IF EXISTS public.stock_entry_kind CASCADE;
DROP TYPE IF EXISTS public.stock_location_type CASCADE;
DROP TYPE IF EXISTS public.order_lock_stage CASCADE;
DROP TYPE IF EXISTS public.role_type CASCADE;

COMMIT;

