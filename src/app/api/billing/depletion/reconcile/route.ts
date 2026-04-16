import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  normalizeReconciliationString,
  rankReconciledAccountCandidates,
} from '@/lib/depletionReconciler';
import { mapDbError } from '@/types';

type ReconcileBody = {
  team_id: string;
  account_names: string[];
};

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body: ReconcileBody = await request.json();
    if (!body.team_id || !Array.isArray(body.account_names)) {
      return NextResponse.json({ error: 'team_id and account_names are required' }, { status: 400 });
    }

    const uniqueNames = Array.from(
      new Set(body.account_names.map(name => String(name ?? '').trim()).filter(Boolean)),
    );

    const { data: accounts, error } = await sb
      .from('accounts')
      .select('id, name')
      .eq('team_id', body.team_id)
      .eq('is_active', true);

    if (error) {
      return NextResponse.json({ error: mapDbError(error) }, { status: 500 });
    }

    const accountOptions = (accounts ?? []) as Array<{ id: string; name: string }>;
    const reconciliations = uniqueNames.map((sourceName) => {
      const candidates = rankReconciledAccountCandidates(sourceName, accountOptions, 3);
      const best = candidates[0] ?? null;
      const confidence =
        !best ? 'none'
          : best.score >= 0.9 ? 'high'
            : best.score >= 0.7 ? 'medium'
              : 'low';

      return {
        source_name: sourceName,
        normalized_source_name: normalizeReconciliationString(sourceName),
        suggested_account_id: best?.id ?? null,
        suggested_account_name: best?.name ?? null,
        suggested_score: best?.score ?? 0,
        confidence,
        candidates,
      };
    });

    return NextResponse.json({
      accounts: accountOptions,
      reconciliations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : mapDbError({ message: String(err) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

