// src/app/app/layout.tsx
// Wraps all /app/* CRM pages with the authenticated shell (Nav + WideLayout).
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import { WideLayout } from '@/components/layout/WideLayout';
import { OnboardingBanner } from '@/components/OnboardingBanner/OnboardingBanner';

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) redirect('/login');

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split('@')[0] ??
    'User';

  // Resolve the user's active team and their role within it
  const teamId = await resolveTeamId(sb, user);
  const { data: memberRow } = await sb
    .from('team_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .maybeSingle();
  const isOwner = memberRow?.role === 'owner';

  // Check if both tables are empty (for this team) to show the onboarding banner
  const productsQuery = sb.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('team_id', teamId);
  const accountsQuery = sb.from('accounts').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('team_id', teamId);
  const [productsRes, accountsRes] = await Promise.all([productsQuery, accountsQuery]);
  const showOnboardingBanner =
    (productsRes.count ?? 0) === 0 && (accountsRes.count ?? 0) === 0;

  return (
    <WideLayout displayName={displayName} isOwner={isOwner}>
      <OnboardingBanner show={showOnboardingBanner} />
      {children}
    </WideLayout>
  );
}
