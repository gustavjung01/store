-- STORE catalog administration: names for manually created products and immutable audit.
-- Apply only to isolated Neon development branch after CI validation.
BEGIN;
CREATE TABLE IF NOT EXISTS public.catalog_edits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  company_code text NOT NULL,
  action text NOT NULL CHECK (action IN ('create', 'update')),
  before_data jsonb,
  after_data jsonb NOT NULL,
  edited_by text NOT NULL,
  catalog_version bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS catalog_edits_created_at_idx
  ON public.catalog_edits (created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS catalog_edits_company_code_idx
  ON public.catalog_edits (company_code);
ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS applied_version bigint;
COMMIT;
