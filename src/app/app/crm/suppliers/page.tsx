// src/app/app/crm/suppliers/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSuppliers } from '@/lib/data';
import { resolveTeamId } from '@/lib/team';
import { SuppliersClient } from '@/components/reports/SuppliersClient';

export const dynamic = 'force-dynamic';

export default async function CrmSuppliersPage() {
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

  const suppliers = await getSuppliers(sb, teamId);

  return (
    <main style={{ padding: '2rem 1.5rem' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, marginBottom: '1.25rem' }}>
        Suppliers
      </h1>
      <div style={{ background: '#fff', border: '1px solid var(--mist)', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <SuppliersClient suppliers={suppliers} />
      </div>
    </main>
  );
}
