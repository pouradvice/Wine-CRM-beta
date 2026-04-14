-- ============================================================
-- 25_distributor_portal.sql
-- Wine CRM — Distributor Portal Schema
--
-- Creates the distributors and distributor_users tables.
-- Adds two supplier portal read policies missing from
-- 04_schema_rework.sql (recaps + follow_ups supplier reads)
-- required for the /supplier/[slug] portal page.
--
-- BOUNDARY: products.distributor (TEXT) is NOT migrated to a
-- FK in this sprint. That migration is a separate workstream
-- (SCH-02 in the tech debt register).
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- 1. distributors
-- Canonical distributor entity records.
-- No team_id — platform layer, shared across broker teams.
-- Managed by platform admins via service-role client.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE distributors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  region      TEXT,
  state       TEXT,
  country     TEXT,
  website     TEXT,
  notes       TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_distributors_updated_at
  BEFORE UPDATE ON distributors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ══════════════════════════════════════════════════════════════
-- 2. distributor_users
-- Maps Supabase auth users to distributors (portal logins).
-- A distributor may have multiple users; a user may represent
-- multiple distributors. Modeled exactly after supplier_users.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE distributor_users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  distributor_id  UUID        NOT NULL REFERENCES distributors(id)  ON DELETE CASCADE,
  role            TEXT        NOT NULL DEFAULT 'viewer'
                                CHECK (role IN ('admin', 'viewer')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, distributor_id)
);


-- ══════════════════════════════════════════════════════════════
-- 3. Indexes
-- ══════════════════════════════════════════════════════════════

CREATE INDEX idx_distributors_name             ON distributors(name);
CREATE INDEX idx_distributors_is_active        ON distributors(is_active);
CREATE INDEX idx_distributor_users_user_id         ON distributor_users(user_id);
CREATE INDEX idx_distributor_users_distributor_id  ON distributor_users(distributor_id);


-- ══════════════════════════════════════════════════════════════
-- 4. Row Level Security — new tables
-- ══════════════════════════════════════════════════════════════

ALTER TABLE distributors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_users ENABLE ROW LEVEL SECURITY;

-- distributors: visible only to authenticated users mapped to
-- that distributor via distributor_users.
-- All writes go through service-role client (platform admin).

CREATE POLICY "distributors_read"
  ON distributors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM distributor_users du
      WHERE du.distributor_id = distributors.id
        AND du.user_id        = auth.uid()
    )
  );

-- distributor_users: users can only read their own mapping rows.

CREATE POLICY "distributor_users_own_rows"
  ON distributor_users FOR ALL
  TO authenticated
  USING (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════
-- 5. Supplier portal read policies (additive to 04_schema_rework)
--
-- These two policies were omitted from the original schema but
-- are required for the /supplier/[slug] portal page to surface
-- account-level activity and pipeline data without exposing
-- team-private broker data.
-- ══════════════════════════════════════════════════════════════

-- recap_products_team_scoped originally reached into recaps to
-- get team_id, creating a cycle once recaps_supplier_read was
-- added (recaps → recap_products → recaps → …).
-- Fix: scope via products.team_id instead — products are already
-- team-owned and their policy only queries team_members, so there
-- is no cross-reference back to recaps or recap_products.

DROP POLICY IF EXISTS "recap_products_team_scoped" ON recap_products;

CREATE POLICY "recap_products_team_scoped"
  ON recap_products FOR ALL
  TO authenticated
  USING (product_id IN (
    SELECT id FROM products
    WHERE team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  ));

-- recaps: supplier users may read recap headers (visit_date,
-- account_id) for recaps that contain their products.
-- Intentionally excludes recap.notes and other broker fields.

CREATE POLICY "recaps_supplier_read"
  ON recaps FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT recap_id
      FROM   recap_products
      WHERE  supplier_id IN (
        SELECT supplier_id FROM supplier_users WHERE user_id = auth.uid()
      )
    )
  );

-- follow_ups: supplier users may read open follow-ups for their
-- products so they can monitor pipeline health across teams.

CREATE POLICY "follow_ups_supplier_read"
  ON follow_ups FOR SELECT
  TO authenticated
  USING (
    supplier_id IN (
      SELECT supplier_id FROM supplier_users WHERE user_id = auth.uid()
    )
  );
