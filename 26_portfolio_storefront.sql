-- ============================================================
-- 26_portfolio_storefront.sql
-- Public storefront + tasting request capture
-- ============================================================

CREATE TABLE portfolio_pages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  calendly_url TEXT NOT NULL DEFAULT 'https://calendly.com/josh-pouradvice/product-tasting',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_portfolio_pages_slug ON portfolio_pages(slug);

CREATE TABLE portfolio_visitors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL,
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, email)
);

CREATE TABLE tasting_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id             UUID NOT NULL,
  visitor_email       TEXT NOT NULL,
  calendly_event_uri  TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasting_request_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES tasting_requests(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_notes TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
