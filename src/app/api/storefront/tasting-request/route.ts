import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { STOREFRONT_EMAIL_RE } from '@/lib/storefront';

interface TastingRequestItemBody {
  product_id?: string;
  buyer_notes?: string;
}

interface CreateTastingRequestBody {
  slug?: string;
  email?: string;
  company_name?: string;
  items?: TastingRequestItemBody[];
  notes?: string;
  calendly_event_uri?: string;
}

interface UpdateTastingRequestBody {
  request_id?: string;
  calendly_event_uri?: string;
}

export async function POST(request: NextRequest) {
  let body: CreateTastingRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = String(body.slug ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const companyName = String(body.company_name ?? '').trim();
  const notes = body.notes?.trim() || null;
  const calendlyEventUri = body.calendly_event_uri?.trim() || null;
  const items = Array.isArray(body.items) ? body.items : [];

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  if (!STOREFRONT_EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }

  if (!companyName) {
    return NextResponse.json({ error: 'company_name is required' }, { status: 400 });
  }

  if (items.length < 1 || items.length > 6) {
    return NextResponse.json({ error: 'items must include 1 to 6 products' }, { status: 400 });
  }

  const productIds = items.map((item) => String(item.product_id ?? '').trim()).filter(Boolean);

  if (productIds.length !== items.length || new Set(productIds).size !== productIds.length) {
    return NextResponse.json({ error: 'items must contain unique valid product_id values' }, { status: 400 });
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

  const { data: products, error: productsError } = await sb
    .from('products')
    .select('id')
    .eq('team_id', page.team_id)
    .eq('is_active', true)
    .in('id', productIds);

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }

  if ((products ?? []).length !== productIds.length) {
    return NextResponse.json({ error: 'One or more products are invalid for this team' }, { status: 400 });
  }

  const { data: requestRow, error: requestError } = await sb
    .from('tasting_requests')
    .insert({
      team_id: page.team_id,
      visitor_email: email,
      company_name: companyName,
      notes,
      calendly_event_uri: calendlyEventUri,
    })
    .select('id')
    .single();

  if (requestError || !requestRow) {
    return NextResponse.json({ error: requestError?.message ?? 'Failed to create tasting request' }, { status: 500 });
  }

  const { error: itemsError } = await sb
    .from('tasting_request_items')
    .insert(
      items.map((item) => ({
        request_id: requestRow.id,
        product_id: String(item.product_id).trim(),
        buyer_notes: item.buyer_notes?.trim() || null,
      })),
    );

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, request_id: requestRow.id });
}

export async function PATCH(request: NextRequest) {
  let body: UpdateTastingRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const requestId = String(body.request_id ?? '').trim();
  const calendlyEventUri = String(body.calendly_event_uri ?? '').trim();

  if (!requestId || !calendlyEventUri) {
    return NextResponse.json({ error: 'request_id and calendly_event_uri are required' }, { status: 400 });
  }

  const sb = createServiceClient();
  const { error } = await sb
    .from('tasting_requests')
    .update({ calendly_event_uri: calendlyEventUri })
    .eq('id', requestId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
