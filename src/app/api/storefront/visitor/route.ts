import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { STOREFRONT_EMAIL_RE } from '@/lib/storefront';

interface VisitorBody {
  slug?: string;
  email?: string;
  company_name?: string;
}

export async function POST(request: NextRequest) {
  let body: VisitorBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = String(body.slug ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const companyName = String(body.company_name ?? '').trim();

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  if (!STOREFRONT_EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }

  if (!companyName) {
    return NextResponse.json({ error: 'company_name is required' }, { status: 400 });
  }

  const sb = createServiceClient();

  const { data: page, error: pageError } = await sb
    .from('portfolio_pages')
    .select('team_id, is_active')
    .eq('slug', slug)
    .maybeSingle();

  if (pageError) {
    return NextResponse.json({ error: pageError.message }, { status: 500 });
  }

  if (!page || !page.is_active) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await sb
    .from('portfolio_visitors')
    .upsert(
      { team_id: page.team_id, email, company_name: companyName },
      { onConflict: 'team_id,email' },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
