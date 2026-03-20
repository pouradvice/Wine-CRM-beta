-- =============================================================
-- Migration: 20240601000000_billing_engine.sql
-- Pour Advice CRM — Supplier Billing Engine: Data Layer
-- Idempotent: uses IF NOT EXISTS and DROP POLICY IF EXISTS.
-- =============================================================


-- ── Table 1: supplier_billing_terms ──────────────────────────

CREATE TABLE IF NOT EXISTS supplier_billing_terms (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id             UUID          NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  team_id                 UUID          NOT NULL,
  billing_period          TEXT          NOT NULL DEFAULT 'monthly',

  -- Placement billing
  placement_rate          NUMERIC(8,2)  NOT NULL,
  placement_lockout_days  INT           NOT NULL DEFAULT 90,

  -- Demo billing
  demo_rate               NUMERIC(8,2)  NOT NULL,
  demo_complimentary      INT           NOT NULL DEFAULT 1,
  demo_hourly_rate        NUMERIC(8,2),

  -- Event billing
  event_rate              NUMERIC(8,2)  NOT NULL,
  event_complimentary     INT           NOT NULL DEFAULT 1,
  event_hourly_rate       NUMERIC(8,2),

  -- Threshold gate
  min_recaps_required     INT           NOT NULL DEFAULT 15,

  effective_from          DATE          NOT NULL,
  effective_to            DATE,                     -- NULL = currently active
  notes                   TEXT,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- ── Table 2: depletion_reports ───────────────────────────────

CREATE TABLE IF NOT EXISTS depletion_reports (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   UUID          NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  team_id       UUID          NOT NULL,
  period_month  DATE          NOT NULL,  -- always first day of month, e.g. 2024-05-01
  raw_data      JSONB,
  row_count     INT,
  imported_by   UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (supplier_id, team_id, period_month)
);


-- ── Table 3: supplier_verified_placements ────────────────────

CREATE TABLE IF NOT EXISTS supplier_verified_placements (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               UUID          NOT NULL,
  supplier_id           UUID          NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  account_id            UUID          NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  product_id            UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  recap_product_id      UUID          NOT NULL REFERENCES recap_products(id) ON DELETE CASCADE,
  salesperson           TEXT          NOT NULL,  -- denormalized from recap for payout isolation
  depletion_report_id   UUID          NOT NULL REFERENCES depletion_reports(id) ON DELETE CASCADE,
  depletion_period      DATE          NOT NULL,
  billing_eligible      BOOLEAN       NOT NULL DEFAULT TRUE,
  billed_on_invoice_id  UUID,                    -- FK set after invoicing (forward reference, added below)
  lockout_expires_at    DATE          NOT NULL,
  verified_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (supplier_id, account_id, product_id, lockout_expires_at)
);


-- ── Table 4: supplier_activity_log ───────────────────────────

CREATE TABLE IF NOT EXISTS supplier_activity_log (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               UUID          NOT NULL,
  supplier_id           UUID          NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  recap_id              UUID          REFERENCES recaps(id) ON DELETE SET NULL,
  salesperson           TEXT          NOT NULL,
  activity_type         TEXT          NOT NULL CHECK (activity_type IN ('Demo', 'Event')),
  activity_date         DATE          NOT NULL,
  additional_hours      NUMERIC(4,2)  NOT NULL DEFAULT 0,
  notes                 TEXT,
  billing_period        DATE          NOT NULL,  -- first day of billing month
  billed_on_invoice_id  UUID,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- ── Table 5: supplier_invoices ───────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_invoices (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             UUID          NOT NULL,
  supplier_id         UUID          NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  billing_period      DATE          NOT NULL,  -- first day of billing month
  status              TEXT          NOT NULL DEFAULT 'Draft'
                        CHECK (status IN ('Draft', 'Reviewed', 'Sent', 'Paid', 'Disputed', 'Void')),
  placements_count    INT           NOT NULL DEFAULT 0,
  demo_count          INT           NOT NULL DEFAULT 0,
  event_count         INT           NOT NULL DEFAULT 0,
  subtotal            NUMERIC(10,2) NOT NULL DEFAULT 0,
  square_invoice_id   TEXT,
  square_invoice_url  TEXT,
  sent_at             TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (supplier_id, team_id, billing_period)
);


-- ── Table 6: supplier_invoice_line_items ─────────────────────

CREATE TABLE IF NOT EXISTS supplier_invoice_line_items (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID          NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  line_type    TEXT          NOT NULL
                 CHECK (line_type IN ('Placement', 'Demo', 'Event', 'Demo Hours', 'Event Hours')),
  description  TEXT          NOT NULL,
  quantity     NUMERIC(8,2)  NOT NULL,
  unit_rate    NUMERIC(8,2)  NOT NULL,
  amount       NUMERIC(10,2) NOT NULL,  -- stored: quantity × unit_rate, never recomputed
  salesperson  TEXT,                    -- NULL = team-level aggregate line
  source_ids   UUID[],                  -- UUIDs of source verified_placements or activity_log rows
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- ── Forward Reference FKs ────────────────────────────────────

ALTER TABLE supplier_verified_placements
  ADD CONSTRAINT fk_svp_invoice
  FOREIGN KEY (billed_on_invoice_id) REFERENCES supplier_invoices(id) ON DELETE SET NULL;

ALTER TABLE supplier_activity_log
  ADD CONSTRAINT fk_sal_invoice
  FOREIGN KEY (billed_on_invoice_id) REFERENCES supplier_invoices(id) ON DELETE SET NULL;


-- ── updated_at Triggers ──────────────────────────────────────

CREATE TRIGGER trg_supplier_billing_terms_updated_at
  BEFORE UPDATE ON supplier_billing_terms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_supplier_activity_log_updated_at
  BEFORE UPDATE ON supplier_activity_log
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_supplier_invoices_updated_at
  BEFORE UPDATE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── Indexes ───────────────────────────────────────────────────

-- supplier_billing_terms
CREATE INDEX IF NOT EXISTS idx_sbt_supplier_id  ON supplier_billing_terms(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sbt_team_id       ON supplier_billing_terms(team_id);
CREATE INDEX IF NOT EXISTS idx_sbt_effective     ON supplier_billing_terms(effective_from, effective_to);

-- depletion_reports
CREATE INDEX IF NOT EXISTS idx_dr_supplier_id   ON depletion_reports(supplier_id);
CREATE INDEX IF NOT EXISTS idx_dr_team_id        ON depletion_reports(team_id);
CREATE INDEX IF NOT EXISTS idx_dr_period_month   ON depletion_reports(period_month);

-- supplier_verified_placements
CREATE INDEX IF NOT EXISTS idx_svp_supplier_id      ON supplier_verified_placements(supplier_id);
CREATE INDEX IF NOT EXISTS idx_svp_team_id           ON supplier_verified_placements(team_id);
CREATE INDEX IF NOT EXISTS idx_svp_account_id        ON supplier_verified_placements(account_id);
CREATE INDEX IF NOT EXISTS idx_svp_salesperson       ON supplier_verified_placements(salesperson);
CREATE INDEX IF NOT EXISTS idx_svp_depletion_period  ON supplier_verified_placements(depletion_period);
CREATE INDEX IF NOT EXISTS idx_svp_billed            ON supplier_verified_placements(billed_on_invoice_id);
CREATE INDEX IF NOT EXISTS idx_svp_lockout           ON supplier_verified_placements(lockout_expires_at);

-- supplier_activity_log
CREATE INDEX IF NOT EXISTS idx_sal_supplier_id    ON supplier_activity_log(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sal_team_id         ON supplier_activity_log(team_id);
CREATE INDEX IF NOT EXISTS idx_sal_salesperson     ON supplier_activity_log(salesperson);
CREATE INDEX IF NOT EXISTS idx_sal_billing_period  ON supplier_activity_log(billing_period);
CREATE INDEX IF NOT EXISTS idx_sal_activity_type   ON supplier_activity_log(activity_type);

-- supplier_invoices
CREATE INDEX IF NOT EXISTS idx_si_supplier_id   ON supplier_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_si_team_id        ON supplier_invoices(team_id);
CREATE INDEX IF NOT EXISTS idx_si_status         ON supplier_invoices(status);
CREATE INDEX IF NOT EXISTS idx_si_billing_period ON supplier_invoices(billing_period);

-- supplier_invoice_line_items
CREATE INDEX IF NOT EXISTS idx_sili_invoice_id  ON supplier_invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sili_salesperson  ON supplier_invoice_line_items(salesperson);
CREATE INDEX IF NOT EXISTS idx_sili_line_type    ON supplier_invoice_line_items(line_type);


-- ── Row Level Security ───────────────────────────────────────

ALTER TABLE supplier_billing_terms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE depletion_reports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_verified_placements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_activity_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_invoice_line_items   ENABLE ROW LEVEL SECURITY;

-- supplier_billing_terms: team members read/write own team's terms
DROP POLICY IF EXISTS "sbt_team_scoped" ON supplier_billing_terms;
CREATE POLICY "sbt_team_scoped" ON supplier_billing_terms
  FOR ALL TO authenticated
  USING  (team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid())));

-- depletion_reports: team members read/write own team's reports
-- supplier_users read their own supplier's reports
DROP POLICY IF EXISTS "dr_team_scoped" ON depletion_reports;
CREATE POLICY "dr_team_scoped" ON depletion_reports
  FOR ALL TO authenticated
  USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid()))
    OR
    supplier_id IN (SELECT supplier_id FROM supplier_users WHERE user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid()))
  );

-- supplier_verified_placements: team members full access; supplier_users read-only their supplier
DROP POLICY IF EXISTS "svp_team_scoped" ON supplier_verified_placements;
CREATE POLICY "svp_team_scoped" ON supplier_verified_placements
  FOR ALL TO authenticated
  USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid()))
    OR
    supplier_id IN (SELECT supplier_id FROM supplier_users WHERE user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid()))
  );

-- supplier_activity_log: team members full access; supplier_users read-only
DROP POLICY IF EXISTS "sal_team_scoped" ON supplier_activity_log;
CREATE POLICY "sal_team_scoped" ON supplier_activity_log
  FOR ALL TO authenticated
  USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid()))
    OR
    supplier_id IN (SELECT supplier_id FROM supplier_users WHERE user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid()))
  );

-- supplier_invoices: team members full access; supplier_users read-only their supplier
DROP POLICY IF EXISTS "si_team_scoped" ON supplier_invoices;
CREATE POLICY "si_team_scoped" ON supplier_invoices
  FOR ALL TO authenticated
  USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid()))
    OR
    supplier_id IN (SELECT supplier_id FROM supplier_users WHERE user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid()))
  );

-- supplier_invoice_line_items: access via parent invoice
DROP POLICY IF EXISTS "sili_via_invoice" ON supplier_invoice_line_items;
CREATE POLICY "sili_via_invoice" ON supplier_invoice_line_items
  FOR ALL TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM supplier_invoices
      WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid()))
      OR supplier_id IN (SELECT supplier_id FROM supplier_users WHERE user_id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM supplier_invoices
      WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid()))
    )
  );


-- ── Verification queries (run after applying migration) ──────
--
-- 1. Confirm all 6 tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'supplier_billing_terms', 'depletion_reports', 'supplier_verified_placements',
--     'supplier_activity_log', 'supplier_invoices', 'supplier_invoice_line_items'
--   )
-- ORDER BY table_name;
-- Expected: 6 rows
--
-- 2. Confirm RLS is enabled on all 6 tables
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'supplier_billing_terms', 'depletion_reports', 'supplier_verified_placements',
--     'supplier_activity_log', 'supplier_invoices', 'supplier_invoice_line_items'
--   );
-- Expected: all rows show rowsecurity = true
--
-- 3. Confirm UNIQUE constraints exist
-- SELECT conname, conrelid::regclass FROM pg_constraint
-- WHERE contype = 'u'
--   AND conrelid::regclass::text IN (
--     'supplier_billing_terms', 'depletion_reports',
--     'supplier_verified_placements', 'supplier_invoices'
--   );
-- Expected: 3 unique constraints visible
--
-- 4. Confirm forward-reference FKs resolve
-- SELECT conname FROM pg_constraint
-- WHERE conname IN ('fk_svp_invoice', 'fk_sal_invoice');
-- Expected: 2 rows
