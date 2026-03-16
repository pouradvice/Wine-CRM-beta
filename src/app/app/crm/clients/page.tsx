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

  const teamId = (user.user_metadata?.team_id as string | undefined) ?? user.id;

  const { data: clients, count } = await getAccounts(sb, 'Active', { page: 0, pageSize: 25 }, teamId);

  return (
    <ClientsClient
      initialClients={clients}
      totalCount={count}
      teamId={teamId}
    />
  );
}
