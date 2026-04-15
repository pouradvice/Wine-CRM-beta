import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import { getAttributionMatches, getSuppliers } from '@/lib/data';
import { AttributionClient } from '@/components/attribution/AttributionClient';

export const dynamic = 'force-dynamic';

export default async function AttributionPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);
  const { data: callerRow } = await sb
    .from('team_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .maybeSingle();

  if (!callerRow || callerRow.role !== 'owner') {
    redirect('/app/crm/clients');
  }

  const [matches, suppliers] = await Promise.all([
    getAttributionMatches(sb, teamId),
    getSuppliers(sb, teamId),
  ]);

  return (
    <AttributionClient
      initialMatches={matches}
      suppliers={suppliers}
    />
  );
}
