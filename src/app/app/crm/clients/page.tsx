// src/app/app/crm/clients/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAccounts } from '@/lib/data';
import { ClientsClient } from '@/components/clients/ClientsClient';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: memberRow } = await sb
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!memberRow?.team_id) {
    redirect('/login');
  }
  const teamId: string = memberRow.team_id;

  const { data: clients, count } = await getAccounts(sb, 'Active', { page: 0, pageSize: 25 }, teamId);

  return (
    <ClientsClient
      initialClients={clients}
      totalCount={count}
      teamId={teamId}
    />
  );
}
