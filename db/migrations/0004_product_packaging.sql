-- STORE: verified product specification and wholesale carton conversion.
-- DEV/isolated PostgreSQL first. Never apply to Neon production without Owner approval.
-- Existing products retain unit=NULL and spec={} when unknown; no guessed carton counts.
BEGIN;
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_spec jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_product_spec_object;
ALTER TABLE public.products
  ADD CONSTRAINT products_product_spec_object CHECK (jsonb_typeof(product_spec) = 'object');
COMMIT;
