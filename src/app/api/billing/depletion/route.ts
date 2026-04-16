import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { matchDepletionToPlacements, recordAttributionForPlacements } from '@/lib/data';
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
    } = await request.json();

    // Upsert depletion report (unique on supplier_id, team_id, period_month)
    const { data: report, error: reportError } = await sb
      .from('depletion_reports')
      .upsert({
        supplier_id:  body.supplier_id,
        team_id:      body.team_id,
        period_month: body.period_month,
        raw_data:     body.rows,
        row_count:    body.rows.length,
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
