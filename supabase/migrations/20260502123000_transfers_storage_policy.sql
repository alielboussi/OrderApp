DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Transfers insert'
  ) THEN
    EXECUTE 'DROP POLICY "Transfers insert" ON storage.objects';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Transfers select'
  ) THEN
    EXECUTE 'DROP POLICY "Transfers select" ON storage.objects';
  END IF;
END $$;

CREATE POLICY "Transfers insert"
ON storage.objects
FOR INSERT
TO authenticated, anon
WITH CHECK (bucket_id = 'Transfers');

CREATE POLICY "Transfers select"
ON storage.objects
FOR SELECT
TO authenticated, anon
USING (bucket_id = 'Transfers');
