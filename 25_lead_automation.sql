-- ============================================================
-- 25_lead_automation.sql
-- Wine CRM — Lead Automation & Tasting Appointments
--
-- Adds three new tables:
--   email_subscribers  — opt-in list for tasting campaigns
--   leads              — inbound tasting requests (Calendly, email, manual)
--   team_settings      — per-team config for the public tasting page
--
-- The public tasting page (/taste?team=<id>) is a Next.js route
-- embedded in WordPress via iframe. No auth required to view or
-- submit the opt-in form.
--
-- Calendly webhook → POST /api/calendly/webhook
--   Creates a Lead row and triggers dossier email to specialist.
--
-- New-brand campaign → POST /api/leads/campaign
--   Internal trigger: sends email to all active subscribers.
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- 1. TEAM SETTINGS
-- Public configuration for the tasting page embed.
-- Calendly URL, contact email, branding copy.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS team_settings (
  team_id       UUID        PRIMARY KEY,
  team_name     TEXT,
  calendly_url  TEXT,         -- Base Calendly booking link (UTM params appended per brand)
  contact_email TEXT,         -- Where dossier briefings are sent
  logo_url      TEXT,
  tagline       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_team_settings_updated_at
  BEFORE UPDATE ON team_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE team_settings ENABLE ROW LEVEL SECURITY;

-- Team members can read + write their own settings
CREATE POLICY "Team members can manage their settings"
  ON team_settings
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- Public read (needed for the unauthenticated tasting page; service role is
-- used server-side, but anon key also needs read for client-side iframes)
CREATE POLICY "Public can read team settings"
  ON team_settings
  FOR SELECT
  USING (TRUE);


-- ══════════════════════════════════════════════════════════════
-- 2. EMAIL SUBSCRIBERS
-- Opt-in recipients for new-brand tasting campaigns.
-- Buyers/buyers' agents who want to be notified.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_subscribers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID        NOT NULL,
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  company     TEXT,
  role        TEXT,
  opt_in_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email, team_id)
);

-- RLS
ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;

-- Team members can manage their subscriber list
CREATE POLICY "Team members can manage subscribers"
  ON email_subscribers
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- Service role (used by public opt-in API route) bypasses RLS automatically.
-- No explicit public-insert policy needed — the API route uses the service key.


-- ══════════════════════════════════════════════════════════════
-- 3. LEADS
-- Inbound tasting requests from any source.
-- Calendly webhook auto-creates rows here.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS leads (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            UUID        NOT NULL,
  name               TEXT        NOT NULL,
  email              TEXT        NOT NULL,
  company            TEXT,
  brand_interest     TEXT,           -- Brand name or ID passed via Calendly UTM
  source             TEXT        NOT NULL DEFAULT 'manual_entry'
                                   CHECK (source IN ('tasting_request', 'email_campaign', 'manual_entry')),
  meeting_date       TIMESTAMPTZ,    -- Scheduled tasting date/time from Calendly
  status             TEXT        NOT NULL DEFAULT 'new'
                                   CHECK (status IN ('new', 'contacted', 'scheduled', 'completed', 'declined')),
  calendly_event_uri TEXT,           -- Calendly event URI for cancellation/reschedule lookups
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Index for quick team queries
CREATE INDEX IF NOT EXISTS leads_team_id_idx ON leads (team_id);
CREATE INDEX IF NOT EXISTS leads_status_idx  ON leads (team_id, status);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can manage leads"
  ON leads
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

-- Service role used by Calendly webhook handler — bypasses RLS.


-- ══════════════════════════════════════════════════════════════
-- 4. PUBLIC READ POLICIES FOR TASTING PAGE
-- The /taste page is rendered server-side with the service role
-- key, so these aren't strictly required. They are added so
-- direct anon-key queries (e.g. iframe client JS) also work.
-- ══════════════════════════════════════════════════════════════

-- Allow public to read active brands (for tasting page tile grid)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'brands'
      AND policyname = 'Public can view active brands'
  ) THEN
    CREATE POLICY "Public can view active brands"
      ON brands FOR SELECT
      USING (is_active = TRUE);
  END IF;
END $$;

-- Allow public to read active products (for dossier + tile grid)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'products'
      AND policyname = 'Public can view active products'
  ) THEN
    CREATE POLICY "Public can view active products"
      ON products FOR SELECT
      USING (is_active = TRUE);
  END IF;
END $$;
