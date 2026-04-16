import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { linkAttributionToInvoiceLineItems } from '@/lib/data';
import type { InvoiceDraftResult } from '@/types';
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

    const result = data as InvoiceDraftResult;

    if (result.status === 'OK') {
      try {
        await linkAttributionToInvoiceLineItems(
          sb,
          body.team_id,
          result.invoice_id,
        );
      } catch (attributionError) {
        console.error('Failed to link attribution matches after invoice draft generation', attributionError);
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : mapDbError({ message: String(err) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
