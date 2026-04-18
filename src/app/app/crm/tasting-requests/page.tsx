// src/app/app/crm/tasting-requests/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import {
  getNonRequestingPortfolioVisitors,
  getPortfolioPage,
  getPortfolioStats,
  upsertPortfolioPage,
} from '@/lib/data';
import type { PortfolioPageSettings } from '@/lib/data';
import { DEFAULT_CALENDLY_URL, defaultSlugForTeam } from '@/lib/portfolio';
import { TastingRequestsClient } from '@/components/tasting-requests/TastingRequestsClient';
import type { TastingRequest } from '@/types';

export const dynamic = 'force-dynamic';

export default async function TastingRequestsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);
  const { data: memberRow } = await sb
    .from('team_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .limit(1)
    .single();

  let portfolioPage: PortfolioPageSettings | null = null;
  if (memberRow?.role === 'owner') {
    portfolioPage = await getPortfolioPage(sb, teamId);
    if (!portfolioPage) {
      portfolioPage = await upsertPortfolioPage(sb, {
        team_id: teamId,
        slug: defaultSlugForTeam(teamId),
        calendly_url: DEFAULT_CALENDLY_URL,
        is_active: true,
      });
    }
  }

  const [{ data: requests }, stats, nonRequestingVisitors] = await Promise.all([
    sb
      .from('tasting_requests')
      .select(`
        id,
        team_id,
        visitor_email,
        company_name,
        calendly_event_uri,
        status,
        notes,
        created_at,
        tasting_request_items (
          id,
          request_id,
          product_id,
          buyer_notes,
          created_at,
          product:products (
            id,
            wine_name,
            type,
            varietal,
            sku_number
          )
        )
      `)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false }),
    getPortfolioStats(sb, teamId),
    getNonRequestingPortfolioVisitors(sb, teamId),
  ]);

  return (
    <TastingRequestsClient
      initialRequests={(requests ?? []) as unknown as TastingRequest[]}
      teamId={teamId}
      initialPortfolioPage={portfolioPage}
      visitorCount={stats.visitorCount}
      nonRequestingVisitors={nonRequestingVisitors}
    />
  );
}
