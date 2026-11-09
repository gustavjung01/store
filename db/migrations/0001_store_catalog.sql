-- STORE: initial read-only catalog and inventory schema.
-- Apply to a Neon DEVELOPMENT branch first; do not migrate production without Owner approval.
-- Company codes remain TEXT. Missing stock is NULL, not 0.
BEGIN;

CREATE TABLE IF NOT EXISTS public.app_members (
  user_id text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('admin','viewer')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code text NOT NULL CHECK (length(btrim(company_code)) > 0),
  company_code_key text GENERATED ALWAYS AS (upper(btrim(company_code))) STORED,
  sku text,
  name text,
  unit text,
  category text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_code_key_unique ON public.products(company_code_key);
CREATE INDEX IF NOT EXISTS products_sku_idx ON public.products(sku);

CREATE TABLE IF NOT EXISTS public.price_types (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.price_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_price_type_id text REFERENCES public.price_types(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.price_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.product_prices (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_type_id text NOT NULL REFERENCES public.price_types(id) ON DELETE CASCADE,
  amount numeric(15,0) NOT NULL CHECK (amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, price_type_id)
);

CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('catalog','inventory')),
  status text NOT NULL CHECK (status IN ('pending','applied','rolled_back','failed')),
  filename text NOT NULL,
  imported_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  row_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.inventory (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer CHECK (quantity IS NULL OR quantity >= 0),
  last_import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.import_rows (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number >= 1),
  company_code text NOT NULL,
  previous_quantity integer,
  next_quantity integer,
  previous_prices jsonb,
  next_prices jsonb,
  error_message text
);
CREATE INDEX IF NOT EXISTS import_rows_batch_idx ON public.import_rows(batch_id);

CREATE TABLE IF NOT EXISTS public.catalog_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz
);
INSERT INTO public.catalog_state(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMIT;
