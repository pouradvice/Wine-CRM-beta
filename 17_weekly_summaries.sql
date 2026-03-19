CREATE TABLE IF NOT EXISTS weekly_summaries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID        NOT NULL,
  week_start      DATE        NOT NULL,  -- Monday of the reporting week
  week_end        DATE        NOT NULL,  -- Sunday of the reporting week
  total_visits    INTEGER     NOT NULL DEFAULT 0,
  total_orders    INTEGER     NOT NULL DEFAULT 0,
  accounts_visited INTEGER    NOT NULL DEFAULT 0,
  conversion_rate_pct NUMERIC(5,1),
  active_follow_ups INTEGER  NOT NULL DEFAULT 0,
  inactive_accounts INTEGER  NOT NULL DEFAULT 0,
  top_products    JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- array of {wine_name, sku_number, orders_placed, conversion_rate_pct}
  top_accounts    JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- array of {account_name, visit_count, orders_placed}
  pipeline_summary JSONB     NOT NULL DEFAULT '{}'::jsonb,    -- {outcome: count} map
  generated_by    UUID        REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, week_start)
);

ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_summaries_team_rls" ON weekly_summaries
  FOR ALL TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_weekly_summaries_team_week ON weekly_summaries (team_id, week_start DESC);
