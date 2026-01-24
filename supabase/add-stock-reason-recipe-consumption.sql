-- Ensure recipe_consumption is a valid stock_reason
DO $$
BEGIN
  ALTER TYPE public.stock_reason ADD VALUE IF NOT EXISTS 'recipe_consumption';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'stock_reason type not found';
END $$;
