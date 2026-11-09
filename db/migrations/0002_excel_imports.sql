-- STORE import staging, concurrency and audit. Apply ONLY to Neon dev until approved.
BEGIN;
ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS staged_payload jsonb,
  ADD COLUMN IF NOT EXISTS base_version bigint,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary jsonb,
  ADD COLUMN IF NOT EXISTS undo_metadata jsonb,
  ADD COLUMN IF NOT EXISTS undone_by text,
  ADD COLUMN IF NOT EXISTS undone_at timestamptz;
ALTER TABLE public.import_rows
  ADD COLUMN IF NOT EXISTS previous_product jsonb,
  ADD COLUMN IF NOT EXISTS previous_inventory_exists boolean,
  ADD COLUMN IF NOT EXISTS previous_inventory_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_inventory_batch_id uuid;
CREATE INDEX IF NOT EXISTS import_batches_status_time_idx
  ON public.import_batches(status, applied_at DESC);
COMMIT;
