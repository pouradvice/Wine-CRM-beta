// src/app/app/page.tsx
// Default landing: redirect to New Recap if the user has any data,
// otherwise redirect to onboarding.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AppRootPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: memberRow } = await sb
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const teamId = memberRow?.team_id;

  let accountsQuery = sb.from('accounts').select('id', { count: 'exact', head: true }).eq('is_active', true);
  let productsQuery = sb.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true);
  if (teamId) {
    accountsQuery = accountsQuery.eq('team_id', teamId);
    productsQuery = productsQuery.eq('team_id', teamId);
  }

  const [accountsRes, productsRes] = await Promise.all([accountsQuery, productsQuery]);

  if ((accountsRes.count ?? 0) === 0 && (productsRes.count ?? 0) === 0) {
    redirect('/app/onboarding');
  }

  redirect('/app/crm/new-recap');
}
