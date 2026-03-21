import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBillingTerms, upsertBillingTerms } from '@/lib/data';
import { mapDbError } from '@/types';
import type { SupplierBillingTermsInsert } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supplierId = request.nextUrl.searchParams.get('supplierId');
    if (!supplierId) return NextResponse.json({ error: 'supplierId required' }, { status: 400 });

    const terms = await getBillingTerms(sb, supplierId);
    return NextResponse.json(terms);
  } catch (err) {
    const message = err instanceof Error ? err.message : mapDbError({ message: String(err) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body: SupplierBillingTermsInsert = await request.json();

    // Close any existing active terms for this supplier+team before inserting new ones
    await sb
      .from('supplier_billing_terms')
      .update({ effective_to: body.effective_from })
      .eq('supplier_id', body.supplier_id)
      .eq('team_id', body.team_id)
      .is('effective_to', null);

    const terms = await upsertBillingTerms(sb, body);
    return NextResponse.json(terms, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : mapDbError({ message: String(err) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
