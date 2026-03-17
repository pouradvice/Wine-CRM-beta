// src/app/app/crm/buyers/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getContacts, getAccounts } from '@/lib/data';
import { resolveTeamId } from '@/lib/team';
import { BuyersClient } from '@/components/buyers/BuyersClient';

export const dynamic = 'force-dynamic';

export default async function BuyersPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);

  const [{ data: contacts }, { data: activeClients }] = await Promise.all([
    getContacts(sb, undefined, { page: 0, pageSize: 50 }, teamId),
    getAccounts(sb, 'Active', { page: 0, pageSize: 200 }, teamId),
  ]);

  return (
    <BuyersClient
      initialBuyers={contacts}
      activeClients={activeClients}
      teamId={teamId}
    />
  );
}
