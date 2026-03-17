-- 11_account_skus.sql
-- Junction table: which SKUs (products) an account actively supports.
-- Managed via the Accounts slideover — same product search as Recap form.

CREATE TABLE IF NOT EXISTS account_skus (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID        NOT NULL,
  account_id UUID        NOT NULL REFERENCES accounts(id)  ON DELETE CASCADE,
  product_id UUID        NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_account_skus_account_id ON account_skus (account_id);
CREATE INDEX IF NOT EXISTS idx_account_skus_product_id ON account_skus (product_id);
CREATE INDEX IF NOT EXISTS idx_account_skus_team_id    ON account_skus (team_id);

-- RLS: team members can read/write their own rows
ALTER TABLE account_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team members can manage account skus"
  ON account_skus
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );
