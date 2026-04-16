import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { matchDepletionToPlacements, recordAttributionForPlacements } from '@/lib/data';
import { normalizeReconciliationString } from '@/lib/depletionReconciler';
import { mapDbError } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body: {
      supplier_id:  string;
      team_id:      string;
      period_month: string;
      rows:         Record<string, unknown>[];
      reconciliation_map?: Record<string, string>;
    } = await request.json();

    const normalizedReconciliationMap = new Map<string, string>();
    for (const [source, target] of Object.entries(body.reconciliation_map ?? {})) {
      const normalizedSource = normalizeReconciliationString(source);
      const normalizedTarget = String(target ?? '').trim();
      if (normalizedSource && normalizedTarget) {
        normalizedReconciliationMap.set(normalizedSource, normalizedTarget);
      }
    }

    const reconciledRows = normalizedReconciliationMap.size === 0
      ? body.rows
      : body.rows.map((row) => {
        const rawAccountName = String(row.account_name ?? '').trim();
        const normalizedAccountName = normalizeReconciliationString(rawAccountName);
        const reconciledAccountName = normalizedReconciliationMap.get(normalizedAccountName);
        if (!reconciledAccountName) return row;

        return {
          ...row,
          account_name: reconciledAccountName,
        };
      });

    // Upsert depletion report (unique on supplier_id, team_id, period_month)
    const { data: report, error: reportError } = await sb
      .from('depletion_reports')
      .upsert({
        supplier_id:  body.supplier_id,
        team_id:      body.team_id,
        period_month: body.period_month,
        raw_data:     reconciledRows,
        row_count:    reconciledRows.length,
        imported_by:  user.id,
        imported_at:  new Date().toISOString(),
      }, { onConflict: 'supplier_id,team_id,period_month' })
      .select()
      .single();

    if (reportError) {
      return NextResponse.json({ error: mapDbError(reportError) }, { status: 500 });
    }

    // Trigger placement matching
    const matchResult = await matchDepletionToPlacements(
      sb,
      body.supplier_id,
      body.period_month,
    );

    try {
      await recordAttributionForPlacements(
        sb,
        body.team_id,
        body.supplier_id,
        report.id,
        body.period_month,
      );
    } catch (attributionError) {
      console.error('Failed to record attribution matches after depletion upload', attributionError);
    }

    return NextResponse.json({ report, matchResult }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : mapDbError({ message: String(err) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
