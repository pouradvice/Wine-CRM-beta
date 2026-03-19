-- 20_expense_receipts_bucket.sql
-- Creates the 'expense-receipts' Storage bucket and its RLS policies.
--
-- Run this in the Supabase SQL editor (or via the CLI).
-- Upload path: {user_id}/receipts/{timestamp}-{filename}

-- 1. Create bucket (public so getPublicUrl works for in-app previews)
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Authenticated users may upload only into their own {user_id}/ folder
CREATE POLICY "expense_receipts_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. Authenticated users may update/overwrite their own files
CREATE POLICY "expense_receipts_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 4. Authenticated users may read their own files
CREATE POLICY "expense_receipts_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 5. Authenticated users may delete their own files
CREATE POLICY "expense_receipts_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
