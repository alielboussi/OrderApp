ALTER TABLE public.catalog_items
ADD COLUMN IF NOT EXISTS qty_decimal_places integer;

UPDATE public.catalog_items
SET qty_decimal_places = 0
WHERE qty_decimal_places IS NULL;

ALTER TABLE public.catalog_items
ALTER COLUMN qty_decimal_places SET DEFAULT 0;

ALTER TABLE public.catalog_items
ADD CONSTRAINT catalog_items_qty_decimal_places_chk
CHECK (qty_decimal_places >= 0 AND qty_decimal_places <= 6);
