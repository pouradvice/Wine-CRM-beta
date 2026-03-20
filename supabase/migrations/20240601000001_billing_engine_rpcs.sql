-- =============================================================
-- Migration: 20240601000001_billing_engine_rpcs.sql
-- Pour Advice CRM — Supplier Billing Engine: RPCs and Views
-- =============================================================


-- ── RPC 1: match_depletion_to_placements ─────────────────────
--
-- Reads a depletion report already in the database and creates
-- supplier_verified_placements rows for confirmed Yes Today outcomes.
-- Returns { new_placements, skipped_lockout, skipped_no_match }.

CREATE OR REPLACE FUNCTION match_depletion_to_placements(
  p_supplier_id  UUID,
  p_period_month DATE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id             UUID;
  v_lockout_days        INT;
  v_depletion_report_id UUID;
  v_new_count           INT := 0;
  v_lockout_count       INT := 0;
  v_no_match_count      INT := 0;
  v_rec                 RECORD;
BEGIN
  -- Resolve team_id from the depletion report for this supplier+period
  SELECT id, team_id
    INTO v_depletion_report_id, v_team_id
    FROM depletion_reports
   WHERE supplier_id  = p_supplier_id
     AND period_month = p_period_month
   LIMIT 1;

  IF v_depletion_report_id IS NULL THEN
    RAISE EXCEPTION 'No depletion report found for supplier % period %', p_supplier_id, p_period_month;
  END IF;

  -- Get lockout days from active billing terms
  SELECT placement_lockout_days
    INTO v_lockout_days
    FROM supplier_billing_terms
   WHERE supplier_id  = p_supplier_id
     AND team_id      = v_team_id
     AND effective_from <= p_period_month
     AND (effective_to IS NULL OR effective_to > p_period_month)
   ORDER BY effective_from DESC
   LIMIT 1;

  IF v_lockout_days IS NULL THEN
    v_lockout_days := 90; -- fallback default
  END IF;

  -- Iterate: first Yes Today per (supplier, account, product) confirmed in depletion report
  FOR v_rec IN
    SELECT DISTINCT ON (rp.product_id, r.account_id)
      rp.id            AS recap_product_id,
      rp.product_id,
      r.account_id,
      r.salesperson,
      r.visit_date,
      a.name           AS account_name
    FROM recap_products rp
    JOIN recaps   r ON r.id = rp.recap_id
    JOIN accounts a ON a.id = r.account_id
    WHERE rp.supplier_id = p_supplier_id
      AND rp.outcome     = 'Yes Today'
      AND r.team_id      = v_team_id
    ORDER BY rp.product_id, r.account_id, r.visit_date ASC
  LOOP
    -- Check lockout: skip if an active verified placement exists
    IF EXISTS (
      SELECT 1 FROM supplier_verified_placements
      WHERE supplier_id        = p_supplier_id
        AND account_id         = v_rec.account_id
        AND product_id         = v_rec.product_id
        AND lockout_expires_at > CURRENT_DATE
    ) THEN
      v_lockout_count := v_lockout_count + 1;
      CONTINUE;
    END IF;

    -- Check depletion confirmation: account must appear in raw_data
    IF NOT EXISTS (
      SELECT 1 FROM depletion_reports
      WHERE id = v_depletion_report_id
        AND raw_data @> ('[{"account_name": "' || v_rec.account_name || '"}]')::jsonb
    ) THEN
      v_no_match_count := v_no_match_count + 1;
      CONTINUE;
    END IF;

    -- Insert verified placement
    INSERT INTO supplier_verified_placements (
      team_id, supplier_id, account_id, product_id,
      recap_product_id, salesperson,
      depletion_report_id, depletion_period,
      lockout_expires_at
    ) VALUES (
      v_team_id, p_supplier_id, v_rec.account_id, v_rec.product_id,
      v_rec.recap_product_id, v_rec.salesperson,
      v_depletion_report_id, p_period_month,
      p_period_month + (v_lockout_days || ' days')::INTERVAL
    )
    ON CONFLICT (supplier_id, account_id, product_id, lockout_expires_at) DO NOTHING;

    IF FOUND THEN
      v_new_count := v_new_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'new_placements',   v_new_count,
    'skipped_lockout',  v_lockout_count,
    'skipped_no_match', v_no_match_count
  );
END;
$$;


-- ── RPC 2: generate_invoice_draft ────────────────────────────
--
-- Creates a Draft invoice for a supplier+period if all gates pass.
-- Returns { status, invoice_id?, subtotal?, recap_count?, required? }.

CREATE OR REPLACE FUNCTION generate_invoice_draft(
  p_supplier_id    UUID,
  p_billing_period DATE   -- first day of billing month e.g. '2024-05-01'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id         UUID;
  v_terms           supplier_billing_terms%ROWTYPE;
  v_recap_count     INT;
  v_invoice_id      UUID;
  v_subtotal        NUMERIC(10,2) := 0;

  -- Placement vars
  v_placement_count INT;
  v_placement_total NUMERIC(10,2);

  -- Demo vars
  v_demo_total_count   INT;
  v_demo_billable      INT;
  v_demo_hours         NUMERIC(6,2);
  v_demo_amount        NUMERIC(10,2);

  -- Event vars
  v_event_total_count  INT;
  v_event_billable     INT;
  v_event_hours        NUMERIC(6,2);
  v_event_amount       NUMERIC(10,2);

  v_rec             RECORD;
BEGIN
  -- Resolve team_id from the calling user's team membership
  SELECT team_id INTO v_team_id
    FROM team_members
   WHERE user_id = (SELECT auth.uid())
   LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'No team found for current user';
  END IF;

  -- Guard: already exists
  IF EXISTS (
    SELECT 1 FROM supplier_invoices
    WHERE supplier_id    = p_supplier_id
      AND team_id        = v_team_id
      AND billing_period = p_billing_period
      AND status        != 'Void'
  ) THEN
    SELECT id INTO v_invoice_id FROM supplier_invoices
    WHERE supplier_id    = p_supplier_id
      AND team_id        = v_team_id
      AND billing_period = p_billing_period
      AND status        != 'Void';
    RETURN jsonb_build_object('status', 'ALREADY_EXISTS', 'invoice_id', v_invoice_id);
  END IF;

  -- Gate 1: minimum recap threshold
  SELECT COUNT(*) INTO v_recap_count
    FROM recaps r
    JOIN recap_products rp ON rp.recap_id = r.id
   WHERE rp.supplier_id = p_supplier_id
     AND r.team_id      = v_team_id
     AND r.visit_date  >= p_billing_period
     AND r.visit_date   < p_billing_period + INTERVAL '1 month';

  -- Get active billing terms
  SELECT * INTO v_terms
    FROM supplier_billing_terms
   WHERE supplier_id  = p_supplier_id
     AND team_id      = v_team_id
     AND effective_from <= p_billing_period
     AND (effective_to IS NULL OR effective_to > p_billing_period)
   ORDER BY effective_from DESC
   LIMIT 1;

  IF v_terms.id IS NULL THEN
    RAISE EXCEPTION 'No active billing terms found for supplier % in team %', p_supplier_id, v_team_id;
  END IF;

  IF v_recap_count < v_terms.min_recaps_required THEN
    RETURN jsonb_build_object(
      'status',      'THRESHOLD_NOT_MET',
      'recap_count', v_recap_count,
      'required',    v_terms.min_recaps_required
    );
  END IF;

  -- Count billable items
  SELECT COUNT(*) INTO v_placement_count
    FROM supplier_verified_placements
   WHERE supplier_id           = p_supplier_id
     AND team_id               = v_team_id
     AND billing_eligible      = TRUE
     AND billed_on_invoice_id IS NULL
     AND depletion_period     >= p_billing_period
     AND depletion_period      < p_billing_period + INTERVAL '1 month';

  SELECT COUNT(*),
         GREATEST(0, COUNT(*) - v_terms.demo_complimentary),
         COALESCE(SUM(additional_hours), 0)
    INTO v_demo_total_count, v_demo_billable, v_demo_hours
    FROM supplier_activity_log
   WHERE supplier_id           = p_supplier_id
     AND team_id               = v_team_id
     AND activity_type         = 'Demo'
     AND billing_period        = p_billing_period
     AND billed_on_invoice_id IS NULL;

  SELECT COUNT(*),
         GREATEST(0, COUNT(*) - v_terms.event_complimentary),
         COALESCE(SUM(additional_hours), 0)
    INTO v_event_total_count, v_event_billable, v_event_hours
    FROM supplier_activity_log
   WHERE supplier_id           = p_supplier_id
     AND team_id               = v_team_id
     AND activity_type         = 'Event'
     AND billing_period        = p_billing_period
     AND billed_on_invoice_id IS NULL;

  -- Gate 2: nothing to bill
  IF v_placement_count = 0 AND v_demo_billable = 0 AND v_event_billable = 0 THEN
    RETURN jsonb_build_object('status', 'NOTHING_TO_BILL');
  END IF;

  -- Compute amounts
  v_placement_total := v_placement_count * v_terms.placement_rate;
  v_demo_amount     := v_demo_billable   * v_terms.demo_rate;
  v_event_amount    := v_event_billable  * v_terms.event_rate;

  v_subtotal := v_placement_total + v_demo_amount + v_event_amount;
  IF v_demo_hours > 0 AND v_terms.demo_hourly_rate IS NOT NULL THEN
    v_subtotal := v_subtotal + (v_demo_hours * v_terms.demo_hourly_rate);
  END IF;
  IF v_event_hours > 0 AND v_terms.event_hourly_rate IS NOT NULL THEN
    v_subtotal := v_subtotal + (v_event_hours * v_terms.event_hourly_rate);
  END IF;

  -- Create invoice
  INSERT INTO supplier_invoices (
    team_id, supplier_id, billing_period, status,
    placements_count, demo_count, event_count, subtotal
  ) VALUES (
    v_team_id, p_supplier_id, p_billing_period, 'Draft',
    v_placement_count, v_demo_total_count, v_event_total_count, v_subtotal
  )
  RETURNING id INTO v_invoice_id;

  -- Per-rep Placement line items
  FOR v_rec IN
    SELECT salesperson,
           COUNT(*)::INT                    AS qty,
           COUNT(*) * v_terms.placement_rate AS amount,
           ARRAY_AGG(id)                    AS source_ids
      FROM supplier_verified_placements
     WHERE supplier_id           = p_supplier_id
       AND team_id               = v_team_id
       AND billing_eligible      = TRUE
       AND billed_on_invoice_id IS NULL
       AND depletion_period     >= p_billing_period
       AND depletion_period      < p_billing_period + INTERVAL '1 month'
     GROUP BY salesperson
  LOOP
    INSERT INTO supplier_invoice_line_items
      (invoice_id, line_type, description, quantity, unit_rate, amount, salesperson, source_ids)
    VALUES (
      v_invoice_id, 'Placement',
      'New account placements — ' || v_rec.salesperson,
      v_rec.qty, v_terms.placement_rate, v_rec.amount,
      v_rec.salesperson, v_rec.source_ids
    );
  END LOOP;

  -- Aggregate Placement line (team total)
  IF v_placement_count > 0 THEN
    INSERT INTO supplier_invoice_line_items
      (invoice_id, line_type, description, quantity, unit_rate, amount, salesperson)
    VALUES (
      v_invoice_id, 'Placement',
      'New account placements — all representatives',
      v_placement_count, v_terms.placement_rate, v_placement_total,
      NULL
    );
  END IF;

  -- Demo line
  IF v_demo_billable > 0 THEN
    INSERT INTO supplier_invoice_line_items
      (invoice_id, line_type, description, quantity, unit_rate, amount)
    VALUES (
      v_invoice_id, 'Demo',
      'Presentation services — ' || v_demo_billable || ' presentation(s) at $' || v_terms.demo_rate || ' each (' || v_demo_total_count || ' total, ' || v_terms.demo_complimentary || ' complimentary)',
      v_demo_billable, v_terms.demo_rate, v_demo_amount
    );
  END IF;

  -- Demo Hours line
  IF v_demo_hours > 0 AND v_terms.demo_hourly_rate IS NOT NULL THEN
    INSERT INTO supplier_invoice_line_items
      (invoice_id, line_type, description, quantity, unit_rate, amount)
    VALUES (
      v_invoice_id, 'Demo Hours',
      'Additional preparation time — ' || v_demo_hours || ' hrs',
      v_demo_hours, v_terms.demo_hourly_rate,
      v_demo_hours * v_terms.demo_hourly_rate
    );
  END IF;

  -- Event line
  IF v_event_billable > 0 THEN
    INSERT INTO supplier_invoice_line_items
      (invoice_id, line_type, description, quantity, unit_rate, amount)
    VALUES (
      v_invoice_id, 'Event',
      'Event services — ' || v_event_billable || ' event(s) at $' || v_terms.event_rate || ' each (' || v_event_total_count || ' total, ' || v_terms.event_complimentary || ' complimentary)',
      v_event_billable, v_terms.event_rate, v_event_amount
    );
  END IF;

  -- Event Hours line
  IF v_event_hours > 0 AND v_terms.event_hourly_rate IS NOT NULL THEN
    INSERT INTO supplier_invoice_line_items
      (invoice_id, line_type, description, quantity, unit_rate, amount)
    VALUES (
      v_invoice_id, 'Event Hours',
      'Additional event coordination time — ' || v_event_hours || ' hrs',
      v_event_hours, v_terms.event_hourly_rate,
      v_event_hours * v_terms.event_hourly_rate
    );
  END IF;

  -- Mark source rows as billed
  UPDATE supplier_verified_placements
     SET billed_on_invoice_id = v_invoice_id
   WHERE supplier_id           = p_supplier_id
     AND team_id               = v_team_id
     AND billing_eligible      = TRUE
     AND billed_on_invoice_id IS NULL
     AND depletion_period     >= p_billing_period
     AND depletion_period      < p_billing_period + INTERVAL '1 month';

  UPDATE supplier_activity_log
     SET billed_on_invoice_id = v_invoice_id
   WHERE supplier_id           = p_supplier_id
     AND team_id               = v_team_id
     AND billing_period        = p_billing_period
     AND billed_on_invoice_id IS NULL;

  RETURN jsonb_build_object(
    'status',     'OK',
    'invoice_id', v_invoice_id,
    'subtotal',   v_subtotal
  );
END;
$$;


-- ── View 1: v_supplier_billing_activity ──────────────────────
--
-- Monthly rollup per supplier. Regular view so RLS on base tables
-- applies automatically — no separate policy needed.

CREATE OR REPLACE VIEW v_supplier_billing_activity AS
SELECT
  svp.supplier_id,
  svp.team_id,
  svp.depletion_period                                        AS billing_period,
  COUNT(svp.id)                                               AS total_placements,
  COUNT(svp.id) FILTER (WHERE svp.billing_eligible = TRUE
    AND svp.billed_on_invoice_id IS NULL)                     AS unbilled_placements,
  COUNT(svp.id) FILTER (WHERE svp.billed_on_invoice_id IS NOT NULL) AS billed_placements,

  COALESCE(demo.demo_count, 0)                                AS demo_count,
  COALESCE(demo.demo_hours, 0)                                AS demo_hours,
  COALESCE(event.event_count, 0)                              AS event_count,
  COALESCE(event.event_hours, 0)                              AS event_hours,

  si.id                                                       AS invoice_id,
  si.status                                                   AS invoice_status,
  si.subtotal                                                 AS invoice_subtotal,
  si.square_invoice_url
FROM supplier_verified_placements svp
LEFT JOIN (
  SELECT supplier_id, team_id, billing_period,
         COUNT(*)              AS demo_count,
         SUM(additional_hours) AS demo_hours
    FROM supplier_activity_log
   WHERE activity_type = 'Demo'
   GROUP BY supplier_id, team_id, billing_period
) demo  ON demo.supplier_id   = svp.supplier_id
       AND demo.team_id        = svp.team_id
       AND demo.billing_period = svp.depletion_period
LEFT JOIN (
  SELECT supplier_id, team_id, billing_period,
         COUNT(*)              AS event_count,
         SUM(additional_hours) AS event_hours
    FROM supplier_activity_log
   WHERE activity_type = 'Event'
   GROUP BY supplier_id, team_id, billing_period
) event ON event.supplier_id   = svp.supplier_id
        AND event.team_id       = svp.team_id
        AND event.billing_period = svp.depletion_period
LEFT JOIN supplier_invoices si
       ON si.supplier_id    = svp.supplier_id
      AND si.team_id        = svp.team_id
      AND si.billing_period = svp.depletion_period
      AND si.status        != 'Void'
GROUP BY svp.supplier_id, svp.team_id, svp.depletion_period,
         demo.demo_count, demo.demo_hours,
         event.event_count, event.event_hours,
         si.id, si.status, si.subtotal, si.square_invoice_url;


-- ── View 2: v_rep_payout_summary ─────────────────────────────
--
-- Per-rep earnings from Placement line items. Reads only named-rep
-- lines (salesperson IS NOT NULL). Independent of invoice payment
-- status — visible as soon as the invoice is drafted.

CREATE OR REPLACE VIEW v_rep_payout_summary AS
SELECT
  sili.salesperson,
  si.supplier_id,
  si.team_id,
  si.billing_period,
  si.id                                   AS invoice_id,
  si.status                               AS invoice_status,
  COUNT(sili.id)                          AS placement_line_count,
  SUM(sili.quantity)                      AS verified_placements,
  SUM(sili.amount)                        AS placement_earnings,
  s.name                                  AS supplier_name
FROM supplier_invoice_line_items sili
JOIN supplier_invoices si ON si.id = sili.invoice_id
JOIN suppliers         s  ON s.id  = si.supplier_id
WHERE sili.line_type   = 'Placement'
  AND sili.salesperson IS NOT NULL
  AND si.status       != 'Void'
GROUP BY sili.salesperson, si.supplier_id, si.team_id,
         si.billing_period, si.id, si.status, s.name;


-- ── Verification queries ──────────────────────────────────────
--
-- 4. Confirm views exist
-- SELECT viewname FROM pg_views WHERE schemaname = 'public'
--   AND viewname IN ('v_supplier_billing_activity', 'v_rep_payout_summary');
-- Expected: 2 rows
--
-- 5. Confirm RPCs exist
-- SELECT proname FROM pg_proc
--   WHERE proname IN ('match_depletion_to_placements', 'generate_invoice_draft');
-- Expected: 2 rows
