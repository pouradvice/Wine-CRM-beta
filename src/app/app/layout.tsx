// src/app/app/layout.tsx
// Wraps all /app/* CRM pages with the authenticated shell (Nav + WideLayout).
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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

  // Check if both tables are empty to show the onboarding banner
  const [productsRes, accountsRes] = await Promise.all([
    sb.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
    sb.from('accounts').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);
  const showOnboardingBanner =
    (productsRes.count ?? 0) === 0 && (accountsRes.count ?? 0) === 0;

  return (
    <WideLayout displayName={displayName}>
      <OnboardingBanner show={showOnboardingBanner} />
      {children}
    </WideLayout>
  );
}
