CREATE TABLE IF NOT EXISTS public.scanners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.scanners (name)
VALUES
  ('Beverages'),
  ('Ingredients'),
  ('Supervisor')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS scanner_id uuid REFERENCES public.scanners(id);

UPDATE public.suppliers s
SET scanner_id = sc.id
FROM public.scanners sc
WHERE s.scanner_id IS NULL
  AND s.scanner_area IS NOT NULL
  AND sc.name = s.scanner_area;

DROP FUNCTION IF EXISTS public.suppliers_for_warehouse(uuid);

CREATE OR REPLACE FUNCTION public.suppliers_for_warehouse(p_warehouse_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  contact_name text,
  contact_phone text,
  contact_email text,
  active boolean,
  scanner_id uuid,
  scanner_name text
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
    s.scanner_id,
    sc.name AS scanner_name
  FROM public.product_supplier_links psl
  JOIN public.suppliers s ON s.id = psl.supplier_id
  LEFT JOIN public.scanners sc ON sc.id = s.scanner_id
  WHERE s.active
    AND psl.active
    AND (
      p_warehouse_id IS NULL
      OR psl.warehouse_id IS NULL
      OR psl.warehouse_id = p_warehouse_id
    );
$function$;
