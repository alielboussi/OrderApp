ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS scanner_area text;

DROP FUNCTION IF EXISTS public.suppliers_for_warehouse(uuid);

CREATE OR REPLACE FUNCTION public.suppliers_for_warehouse(p_warehouse_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  contact_name text,
  contact_phone text,
  contact_email text,
  active boolean,
  scanner_area text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT
    s.id,
    s.name,
    s.contact_name,
    s.contact_phone,
    s.contact_email,
    s.active,
    s.scanner_area
  FROM public.product_supplier_links psl
  JOIN public.suppliers s ON s.id = psl.supplier_id
  WHERE s.active
    AND psl.active
    AND (
      p_warehouse_id IS NULL
      OR psl.warehouse_id IS NULL
      OR psl.warehouse_id = p_warehouse_id
    );
$function$;
