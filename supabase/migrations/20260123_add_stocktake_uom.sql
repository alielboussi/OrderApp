ALTER TABLE public.catalog_items
ADD COLUMN IF NOT EXISTS stocktake_uom text;

COMMENT ON COLUMN public.catalog_items.stocktake_uom IS 'Optional unit for warehouse stocktake counts; defaults to consumption_uom when null.';
