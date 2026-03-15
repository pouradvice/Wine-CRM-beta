// src/app/app/crm/buyers/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBuyers, getClients } from '@/lib/data';
import { BuyersClient } from '@/components/buyers/BuyersClient';

export const dynamic = 'force-dynamic';

export default async function BuyersPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: buyers }, { data: activeClients }] = await Promise.all([
    getBuyers(sb, undefined, { page: 0, pageSize: 50 }),
    getClients(sb, 'Active', { page: 0, pageSize: 200 }),
  ]);

  const teamId = (user.user_metadata?.team_id as string | undefined) ?? user.id;

  return (
    <BuyersClient
      initialBuyers={buyers}
      activeClients={activeClients}
      teamId={teamId}
    />
  );
}
