-- 15_primary_contact_id.sql
-- Replaces the plain-text primary_contact column (from 13_add_primary_contact.sql)
-- with a proper FK reference to the contacts table.
--
-- Run this in the Supabase SQL editor.

-- 1. Drop the old plain-text column if it was added by 13_add_primary_contact.sql
ALTER TABLE accounts
  DROP COLUMN IF EXISTS primary_contact;

-- 2. Add the FK column (nullable — no contact set by default)
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS primary_contact_id UUID
    REFERENCES contacts(id) ON DELETE SET NULL;

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_accounts_primary_contact_id
  ON accounts(primary_contact_id);
