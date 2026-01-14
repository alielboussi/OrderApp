-- Step 3: Remove catalog_variants + variant_id columns; enforce variant_key only
-- Assumes step1 + step2 applied and clients now send variant_key.

begin;

-- Remove dual-write trigger function and hooks
DROP TRIGGER IF EXISTS outlet_sales_variant_key_dual ON public.outlet_sales;
DROP TRIGGER IF EXISTS stock_ledger_variant_key_dual ON public.stock_ledger;
DROP TRIGGER IF EXISTS outlet_stock_balances_variant_key_dual ON public.outlet_stock_balances;
DROP TRIGGER IF EXISTS warehouse_defaults_variant_key_dual ON public.warehouse_defaults;
DROP TRIGGER IF EXISTS warehouse_purchase_items_variant_key_dual ON public.warehouse_purchase_items;
DROP TRIGGER IF EXISTS warehouse_transfer_items_variant_key_dual ON public.warehouse_transfer_items;
DROP TRIGGER IF EXISTS item_transfer_profiles_variant_key_dual ON public.item_transfer_profiles;
DROP TRIGGER IF EXISTS item_warehouse_policies_variant_key_dual ON public.item_warehouse_handling_policies;
DROP TRIGGER IF EXISTS outlet_item_routes_variant_key_dual ON public.outlet_item_routes;
DROP TRIGGER IF EXISTS product_supplier_links_variant_key_dual ON public.product_supplier_links;
DROP TRIGGER IF EXISTS order_items_variant_key_dual ON public.order_items;
DROP TRIGGER IF EXISTS pos_item_map_variant_key_dual ON public.pos_item_map;
DROP FUNCTION IF EXISTS public.trg_variant_key_dualwrite();

-- Normalize null/empty keys to 'base' before constraints
UPDATE public.item_recipes SET finished_variant_key = coalesce(nullif(finished_variant_key, ''), 'base') WHERE finished_variant_key IS NULL OR finished_variant_key = '';
UPDATE public.item_recipe_ingredients SET ingredient_variant_key = coalesce(nullif(ingredient_variant_key, ''), 'base') WHERE ingredient_variant_key IS NULL OR ingredient_variant_key = '';
UPDATE public.item_transfer_profiles SET variant_key = coalesce(nullif(variant_key, ''), 'base') WHERE variant_key IS NULL OR variant_key = '';
UPDATE public.item_warehouse_handling_policies SET variant_key = coalesce(nullif(variant_key, ''), 'base') WHERE variant_key IS NULL OR variant_key = '';
UPDATE public.outlet_item_routes SET variant_key = coalesce(nullif(variant_key, ''), 'base'), normalized_variant_key = coalesce(nullif(normalized_variant_key, ''), 'base') WHERE variant_key IS NULL OR variant_key = '' OR normalized_variant_key IS NULL OR normalized_variant_key = '';
UPDATE public.outlet_sales SET variant_key = coalesce(nullif(variant_key, ''), 'base') WHERE variant_key IS NULL OR variant_key = '';
UPDATE public.outlet_stock_balances SET variant_key = coalesce(nullif(variant_key, ''), 'base') WHERE variant_key IS NULL OR variant_key = '';
UPDATE public.outlet_stocktakes SET variant_key = coalesce(nullif(variant_key, ''), 'base') WHERE variant_key IS NULL OR variant_key = '';
UPDATE public.product_supplier_links SET variant_key = coalesce(nullif(variant_key, ''), 'base') WHERE variant_key IS NULL OR variant_key = '';
UPDATE public.stock_ledger SET variant_key = coalesce(nullif(variant_key, ''), 'base') WHERE variant_key IS NULL OR variant_key = '';
UPDATE public.warehouse_defaults SET variant_key = coalesce(nullif(variant_key, ''), 'base') WHERE variant_key IS NULL OR variant_key = '';
UPDATE public.warehouse_purchase_items SET variant_key = coalesce(nullif(variant_key, ''), 'base') WHERE variant_key IS NULL OR variant_key = '';
UPDATE public.warehouse_transfer_items SET variant_key = coalesce(nullif(variant_key, ''), 'base') WHERE variant_key IS NULL OR variant_key = '';
UPDATE public.order_items SET variation_key = coalesce(nullif(variation_key, ''), 'base') WHERE variation_key IS NULL OR variation_key = '';
UPDATE public.pos_item_map SET catalog_variant_key = coalesce(nullif(catalog_variant_key, ''), 'base'), normalized_variant_key = coalesce(nullif(normalized_variant_key, ''), 'base') WHERE catalog_variant_key IS NULL OR catalog_variant_key = '' OR normalized_variant_key IS NULL OR normalized_variant_key = '';

-- Enforce not null + defaults for keys
ALTER TABLE public.item_recipes ALTER COLUMN finished_variant_key SET DEFAULT 'base', ALTER COLUMN finished_variant_key SET NOT NULL;
ALTER TABLE public.item_recipe_ingredients ALTER COLUMN ingredient_variant_key SET DEFAULT 'base', ALTER COLUMN ingredient_variant_key SET NOT NULL;
ALTER TABLE public.item_transfer_profiles ALTER COLUMN variant_key SET DEFAULT 'base', ALTER COLUMN variant_key SET NOT NULL;
ALTER TABLE public.item_warehouse_handling_policies ALTER COLUMN variant_key SET DEFAULT 'base', ALTER COLUMN variant_key SET NOT NULL;
ALTER TABLE public.outlet_item_routes ALTER COLUMN variant_key SET DEFAULT 'base', ALTER COLUMN variant_key SET NOT NULL, ALTER COLUMN normalized_variant_key SET DEFAULT 'base', ALTER COLUMN normalized_variant_key SET NOT NULL;
ALTER TABLE public.outlet_sales ALTER COLUMN variant_key SET DEFAULT 'base', ALTER COLUMN variant_key SET NOT NULL;
ALTER TABLE public.outlet_stock_balances ALTER COLUMN variant_key SET DEFAULT 'base', ALTER COLUMN variant_key SET NOT NULL;
ALTER TABLE public.outlet_stocktakes ALTER COLUMN variant_key SET DEFAULT 'base', ALTER COLUMN variant_key SET NOT NULL;
ALTER TABLE public.product_supplier_links ALTER COLUMN variant_key SET DEFAULT 'base', ALTER COLUMN variant_key SET NOT NULL;
ALTER TABLE public.stock_ledger ALTER COLUMN variant_key SET DEFAULT 'base', ALTER COLUMN variant_key SET NOT NULL;
ALTER TABLE public.warehouse_defaults ALTER COLUMN variant_key SET DEFAULT 'base', ALTER COLUMN variant_key SET NOT NULL;
ALTER TABLE public.warehouse_purchase_items ALTER COLUMN variant_key SET DEFAULT 'base', ALTER COLUMN variant_key SET NOT NULL;
ALTER TABLE public.warehouse_transfer_items ALTER COLUMN variant_key SET DEFAULT 'base', ALTER COLUMN variant_key SET NOT NULL;
ALTER TABLE public.order_items ALTER COLUMN variation_key SET DEFAULT 'base', ALTER COLUMN variation_key SET NOT NULL;
ALTER TABLE public.pos_item_map ALTER COLUMN catalog_variant_key SET DEFAULT 'base', ALTER COLUMN catalog_variant_key SET NOT NULL, ALTER COLUMN normalized_variant_key SET DEFAULT 'base', ALTER COLUMN normalized_variant_key SET NOT NULL;

-- Drop variant_id columns now that keys are enforced
ALTER TABLE public.item_recipes DROP COLUMN IF EXISTS finished_variant_id;
ALTER TABLE public.item_recipe_ingredients DROP COLUMN IF EXISTS ingredient_variant_id;
ALTER TABLE public.item_transfer_profiles DROP COLUMN IF EXISTS variant_id;
ALTER TABLE public.item_warehouse_handling_policies DROP COLUMN IF EXISTS variant_id;
ALTER TABLE public.outlet_item_routes DROP COLUMN IF EXISTS variant_id;
ALTER TABLE public.outlet_sales DROP COLUMN IF EXISTS variant_id;
ALTER TABLE public.outlet_stock_balances DROP COLUMN IF EXISTS variant_id;
ALTER TABLE public.outlet_stocktakes DROP COLUMN IF EXISTS variant_id;
ALTER TABLE public.product_supplier_links DROP COLUMN IF EXISTS variant_id;
ALTER TABLE public.stock_ledger DROP COLUMN IF EXISTS variant_id;
ALTER TABLE public.warehouse_defaults DROP COLUMN IF EXISTS variant_id;
ALTER TABLE public.warehouse_purchase_items DROP COLUMN IF EXISTS variant_id;
ALTER TABLE public.warehouse_transfer_items DROP COLUMN IF EXISTS variant_id;
ALTER TABLE public.order_items DROP COLUMN IF EXISTS variation_id;
ALTER TABLE public.pos_item_map DROP COLUMN IF EXISTS catalog_variant_id;

-- Rebuild key-based indexes where the old ones depended on variant_id
DROP INDEX IF EXISTS idx_item_recipes_finished;
CREATE INDEX IF NOT EXISTS idx_item_recipes_finished_key ON public.item_recipes(finished_item_id, finished_variant_key) WHERE active;

-- Optional: tighten lookup indexes for key columns used in functions
CREATE INDEX IF NOT EXISTS idx_outlet_item_routes_key ON public.outlet_item_routes(outlet_id, item_id, normalized_variant_key);
CREATE INDEX IF NOT EXISTS idx_warehouse_defaults_key ON public.warehouse_defaults(item_id, variant_key);
CREATE INDEX IF NOT EXISTS idx_pos_item_map_key ON public.pos_item_map(outlet_id, pos_item_id, normalized_variant_key);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_key ON public.stock_ledger(warehouse_id, item_id, variant_key) WHERE location_type = 'warehouse';

-- Drop the legacy catalog_variants table
DROP TABLE IF EXISTS public.catalog_variants CASCADE;

commit;
