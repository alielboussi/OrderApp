alter function public.record_outlet_sale(
  uuid,
  uuid,
  numeric,
  text,
  boolean,
  uuid,
  timestamptz,
  jsonb
) set row_security = off;

alter function public.record_outlet_sale(
  uuid,
  uuid,
  numeric,
  text,
  boolean,
  uuid,
  timestamptz,
  numeric,
  numeric,
  numeric,
  text,
  jsonb
) set row_security = off;
