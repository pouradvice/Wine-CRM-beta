// src/app/app/crm/new-recap/page.tsx
// Server component: loads active clients, then hands off to the RecapForm.
//
// Changes from Phase 1 baseline:
//   • getBuyers() removed — RecapForm fetches buyers lazily on client selection.
//   • getClients() now returns PaginatedResult<Client>; we pass only .data.
//   • getProducts() is no longer called here — RecapForm searches server-side.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAccounts } from '@/lib/data';
import { RecapForm } from '@/components/RecapForm/RecapForm';

export const dynamic = 'force-dynamic';

export default async function NewRecapPage() {
  const sb = await createClient();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: memberRow } = await sb
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const teamId: string = memberRow?.team_id ?? user.id;

  // Load all active clients for the account selector.
  // 200 is a safe ceiling for Phase 1; paginate this selector in Phase 2
  // if client counts grow beyond that.
  const { data: clients } = await getAccounts(sb, 'Active', { page: 0, pageSize: 200 }, teamId);

  const displayName =
    user.user_metadata?.full_name ??
    user.email?.split('@')[0] ??
    'Unknown';

  return (
    <div>
      <h1 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: '1.75rem',
        fontWeight: 700,
        color: 'var(--ink)',
        padding: '1.5rem 1.5rem 0',
        margin: 0,
      }}>
        New Recap
      </h1>
      <RecapForm
        clients={clients}
        currentUser={displayName}
      />
    </div>
  );
}
