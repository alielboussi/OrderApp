-- Zero-loss Firestore import staging schema.
-- Every document (including subcollections) lands here before relational normalization.

CREATE SCHEMA IF NOT EXISTS firestore_mirror;

CREATE TABLE IF NOT EXISTS firestore_mirror.documents (
  collection_path text NOT NULL,
  document_id text NOT NULL,
  data jsonb NOT NULL,
  exported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_path, document_id)
);

CREATE INDEX IF NOT EXISTS firestore_mirror_documents_collection_idx
  ON firestore_mirror.documents (collection_path);

CREATE INDEX IF NOT EXISTS firestore_mirror_documents_data_gin_idx
  ON firestore_mirror.documents USING gin (data);

CREATE TABLE IF NOT EXISTS firestore_mirror.export_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  source_project text NOT NULL,
  document_count integer NOT NULL DEFAULT 0,
  collection_count integer NOT NULL DEFAULT 0,
  notes text
);

COMMENT ON SCHEMA firestore_mirror IS
  'Staging area for full Firestore exports before Supabase normalization.';

-- Allow service role (and API) to read/write mirror tables
GRANT USAGE ON SCHEMA firestore_mirror TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA firestore_mirror TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA firestore_mirror TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA firestore_mirror
  GRANT ALL ON TABLES TO postgres, service_role;

