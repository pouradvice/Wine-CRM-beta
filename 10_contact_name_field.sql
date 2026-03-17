-- ══════════════════════════════════════════════════════════════
-- 10_contact_name_field.sql
-- ══════════════════════════════════════════════════════════════
-- Adds a free-text contact_name column to recaps.
-- This stores the Account Lead (or any contact name) entered
-- during recap creation without requiring a contacts table FK.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE recaps
  ADD COLUMN IF NOT EXISTS contact_name TEXT;
