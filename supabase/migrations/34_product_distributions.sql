-- ============================================================
-- 34_product_distributions.sql
-- Structured product ↔ distributor ↔ territory assignments
-- ============================================================

CREATE TABLE IF NOT EXISTS product_distributions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  distributor_id  UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  territory       TEXT NOT NULL,
  team_id         UUID NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, distributor_id, territory)
);

CREATE INDEX IF NOT EXISTS idx_product_distributions_product_id
  ON product_distributions(product_id);
CREATE INDEX IF NOT EXISTS idx_product_distributions_distributor_id
  ON product_distributions(distributor_id);
CREATE INDEX IF NOT EXISTS idx_product_distributions_territory
  ON product_distributions(territory);
CREATE INDEX IF NOT EXISTS idx_product_distributions_team_id
  ON product_distributions(team_id);
CREATE INDEX IF NOT EXISTS idx_product_distributions_is_active
  ON product_distributions(is_active);

DROP TRIGGER IF EXISTS trg_product_distributions_updated_at ON product_distributions;
CREATE TRIGGER trg_product_distributions_updated_at
  BEFORE UPDATE ON product_distributions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE product_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_distributions_team_scoped"
  ON product_distributions FOR ALL
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "product_distributions_distributor_read"
  ON product_distributions FOR SELECT
  TO authenticated
  USING (
    distributor_id IN (
      SELECT distributor_id FROM distributor_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "product_distributions_supplier_read"
  ON product_distributions FOR SELECT
  TO authenticated
  USING (
    product_id IN (
      SELECT id
      FROM products
      WHERE supplier_id IN (
        SELECT supplier_id FROM supplier_users WHERE user_id = auth.uid()
      )
    )
  );

-- Additive distributor read policies on existing tables

CREATE POLICY "products_distributor_read"
  ON products FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT pd.product_id
      FROM product_distributions pd
      WHERE pd.is_active = TRUE
        AND pd.distributor_id IN (
          SELECT distributor_id FROM distributor_users WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "recap_products_distributor_read"
  ON recap_products FOR SELECT
  TO authenticated
  USING (
    product_id IN (
      SELECT pd.product_id
      FROM product_distributions pd
      WHERE pd.is_active = TRUE
        AND pd.distributor_id IN (
          SELECT distributor_id FROM distributor_users WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "accounts_distributor_read"
  ON accounts FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT DISTINCT r.account_id
      FROM recaps r
      JOIN recap_products rp ON rp.recap_id = r.id
      WHERE rp.product_id IN (
        SELECT pd.product_id
        FROM product_distributions pd
        WHERE pd.is_active = TRUE
          AND pd.distributor_id IN (
            SELECT distributor_id FROM distributor_users WHERE user_id = auth.uid()
          )
      )
    )
  );

CREATE POLICY "brands_distributor_read"
  ON brands FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT DISTINCT p.brand_id
      FROM products p
      JOIN product_distributions pd ON pd.product_id = p.id
      WHERE p.brand_id IS NOT NULL
        AND pd.is_active = TRUE
        AND pd.distributor_id IN (
          SELECT distributor_id FROM distributor_users WHERE user_id = auth.uid()
        )
    )
  );

NOTIFY pgrst, 'reload schema';
