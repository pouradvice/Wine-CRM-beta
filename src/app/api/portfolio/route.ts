import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import { getPortfolioPage, upsertPortfolioPage } from '@/lib/data';
import { DEFAULT_CALENDLY_URL, defaultSlugForTeam, PORTFOLIO_SLUG_RE } from '@/lib/portfolio';

async function requireOwner() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const teamId = await resolveTeamId(sb, user);
  const { data: member } = await sb
    .from('team_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .maybeSingle();

  if (!member || member.role !== 'owner') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { sb, teamId };
}

export async function GET() {
  const auth = await requireOwner();
  if ('error' in auth) return auth.error;

  const { sb, teamId } = auth;

  let page = await getPortfolioPage(sb, teamId);
  if (!page) {
    page = await upsertPortfolioPage(sb, {
      team_id: teamId,
      slug: defaultSlugForTeam(teamId),
      calendly_url: DEFAULT_CALENDLY_URL,
      is_active: true,
    });
  }

  return NextResponse.json({ data: page });
}

export async function PUT(request: NextRequest) {
  const auth = await requireOwner();
  if ('error' in auth) return auth.error;

  const { sb, teamId } = auth;

  let body: { slug?: string; calendly_url?: string; is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = String(body.slug ?? '').trim().toLowerCase();
  const hasCalendlyValue = body.calendly_url !== undefined;
  const calendlyUrl = hasCalendlyValue
    ? String(body.calendly_url ?? '').trim()
    : DEFAULT_CALENDLY_URL;
  const isActive = Boolean(body.is_active);

  if (!slug) {
    return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
  }

  if (!PORTFOLIO_SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Slug must use only lowercase letters, numbers, and hyphens' }, { status: 400 });
  }

  if (!calendlyUrl) {
    return NextResponse.json({ error: 'Calendly URL is required' }, { status: 400 });
  }

  try {
    const parsed = new URL(calendlyUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Calendly URL must start with http:// or https://' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Calendly URL must be a valid URL' }, { status: 400 });
  }

  const existing = await getPortfolioPage(sb, teamId);
  const conflictQuery = sb
    .from('portfolio_pages')
    .select('id, team_id')
    .eq('slug', slug);

  const { data: conflict } = existing
    ? await conflictQuery.neq('id', existing.id).maybeSingle()
    : await conflictQuery.maybeSingle();

  if (conflict) {
    return NextResponse.json({ error: 'Slug is already in use' }, { status: 409 });
  }

  const data = await upsertPortfolioPage(sb, {
    team_id: teamId,
    slug,
    calendly_url: calendlyUrl,
    is_active: isActive,
  });

  return NextResponse.json({ data });
}
