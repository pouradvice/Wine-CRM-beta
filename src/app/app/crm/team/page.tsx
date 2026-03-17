// src/app/app/crm/team/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { TeamClient, type TeamMember } from '@/components/team/TeamClient';
import { resolveTeamId } from '@/lib/team';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);

  // Only owners can access this page
  const { data: callerRow } = await sb
    .from('team_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .maybeSingle();

  if (!callerRow || callerRow.role !== 'owner') {
    redirect('/app/crm/clients');
  }

  // Fetch all members of this team
  const { data: rows } = await sb
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', teamId)
    .order('role', { ascending: true });

  const memberRows = rows ?? [];

  // Look up email / display name for each member via the admin API
  const svc = createServiceClient();
  const members: TeamMember[] = await Promise.all(
    memberRows.map(async (row) => {
      const { data } = await svc.auth.admin.getUserById(row.user_id);
      const authUser = data?.user;
      return {
        user_id:      row.user_id,
        role:         row.role,
        email:        authUser?.email ?? row.user_id,
        display_name: (authUser?.user_metadata?.full_name as string | undefined) ?? '',
      };
    }),
  );

  return (
    <TeamClient
      members={members}
      currentUserId={user.id}
    />
  );
}
