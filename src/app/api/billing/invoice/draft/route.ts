import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapDbError } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body: {
      supplier_id:    string;
      team_id:        string;
      billing_period: string;
    } = await request.json();

    const { data, error } = await sb.rpc('generate_invoice_draft', {
      p_supplier_id:    body.supplier_id,
      p_team_id:        body.team_id,
      p_billing_period: body.billing_period,
    });

    if (error) {
      return NextResponse.json({ error: mapDbError(error) }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : mapDbError({ message: String(err) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
