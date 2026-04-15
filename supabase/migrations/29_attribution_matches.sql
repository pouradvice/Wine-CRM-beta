CREATE TABLE IF NOT EXISTS attribution_matches (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id              UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  supplier_id          UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  recap_product_id     UUID REFERENCES recap_products(id) ON DELETE SET NULL,
  depletion_report_id  UUID REFERENCES depletion_reports(id) ON DELETE SET NULL,
  placement_id         UUID REFERENCES supplier_verified_placements(id) ON DELETE SET NULL,
  invoice_line_item_id UUID REFERENCES supplier_invoice_line_items(id) ON DELETE SET NULL,
  confidence_score     NUMERIC(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
  match_type           TEXT NOT NULL DEFAULT 'auto' CHECK (match_type IN ('auto', 'manual', 'disputed', 'overridden')),
  status               TEXT NOT NULL DEFAULT 'matched' CHECK (status IN ('matched', 'disputed', 'resolved', 'voided')),
  matched_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at          TIMESTAMPTZ,
  resolved_by          UUID REFERENCES auth.users(id),
  CONSTRAINT attribution_matches_resolution_pair_chk
    CHECK (
      (resolved_at IS NULL AND resolved_by IS NULL)
      OR
      (resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
    ),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attribution_matches_team_id ON attribution_matches(team_id);
CREATE INDEX IF NOT EXISTS idx_attribution_matches_supplier_id ON attribution_matches(supplier_id);
CREATE INDEX IF NOT EXISTS idx_attribution_matches_placement_id ON attribution_matches(placement_id);
CREATE INDEX IF NOT EXISTS idx_attribution_matches_status ON attribution_matches(status);
CREATE INDEX IF NOT EXISTS idx_attribution_matches_matched_at ON attribution_matches(matched_at);

ALTER TABLE attribution_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attribution_matches_team_scoped" ON attribution_matches;
CREATE POLICY "attribution_matches_team_scoped" ON attribution_matches
  FOR ALL TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ))
  WITH CHECK (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));

NOTIFY pgrst, 'reload schema';
