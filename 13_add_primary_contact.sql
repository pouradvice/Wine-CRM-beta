-- 13_add_primary_contact.sql
-- Adds a primary_contact text field to the accounts table.
-- This stores the name of the primary buyer/contact at the account,
-- and is used to pre-populate the Contact field on new recaps.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS primary_contact TEXT;
