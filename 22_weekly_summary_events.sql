-- 22_weekly_summary_events.sql
-- Add event_recaps, off_site_recaps, and new_menu_placements JSONB columns
-- to weekly_summaries so the CSV export can include per-visit detail rows
-- for Event and Off-Premise Tasting recaps, and new menu placements.

ALTER TABLE weekly_summaries
  ADD COLUMN IF NOT EXISTS event_recaps        JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS off_site_recaps     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS new_menu_placements JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN weekly_summaries.event_recaps        IS 'Array of {account_name, visit_date, occasion} for Event recaps in the week';
COMMENT ON COLUMN weekly_summaries.off_site_recaps     IS 'Array of {account_name, visit_date} for Off-Premise Tasting recaps in the week';
COMMENT ON COLUMN weekly_summaries.new_menu_placements IS 'Array of {account_name, wine_name, visit_date} for menu placements recorded in the week';
