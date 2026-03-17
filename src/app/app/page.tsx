// src/app/app/page.tsx
// Default landing: redirect to New Recap if the user has any data,
// otherwise redirect to onboarding.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';

export const dynamic = 'force-dynamic';

export default async function AppRootPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);

  const accountsQuery = sb.from('accounts').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('team_id', teamId);
  const productsQuery = sb.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('team_id', teamId);

  const [accountsRes, productsRes] = await Promise.all([accountsQuery, productsQuery]);

  if ((accountsRes.count ?? 0) === 0 && (productsRes.count ?? 0) === 0) {
    redirect('/app/onboarding');
  }

  redirect('/app/crm/new-recap');
}
