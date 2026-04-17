import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import { getPortfolioPage, getPortfolioStats, upsertPortfolioPage } from '@/lib/data';
import { PortfolioAdminClient } from './PortfolioAdminClient';

export const dynamic = 'force-dynamic';

const DEFAULT_CALENDLY_URL = 'https://calendly.com/josh-pouradvice/product-tasting';

function defaultSlugForTeam(teamId: string): string {
  return `team-${teamId.toLowerCase()}`;
}

export default async function PortfolioPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);

  const memberRow = await sb
    .from('team_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .limit(1)
    .single();

  if (memberRow.data?.role !== 'owner') redirect('/app/crm/clients');

  let page = await getPortfolioPage(sb, teamId);
  if (!page) {
    page = await upsertPortfolioPage(sb, {
      team_id: teamId,
      slug: defaultSlugForTeam(teamId),
      calendly_url: DEFAULT_CALENDLY_URL,
      is_active: true,
    });
  }

  const stats = await getPortfolioStats(sb, teamId);

  return (
    <PortfolioAdminClient initialPage={page} stats={stats} />
  );
}
