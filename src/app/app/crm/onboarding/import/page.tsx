// src/app/app/crm/onboarding/import/page.tsx
// Onboarding import hub — two cards for Products and Accounts import

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NarrowLayout } from '@/components/layout/NarrowLayout';
import { ImportHub } from './ImportHub';

export const dynamic = 'force-dynamic';

export default async function OnboardingImportPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: memberRow } = await sb
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!memberRow?.team_id) {
    redirect('/app/onboarding');
  }
  const teamId: string = memberRow.team_id;

  return (
    <NarrowLayout
      title="Import Data"
      subtitle="Upload a CSV to quickly populate your product catalog or account list."
    >
      <ImportHub teamId={teamId} />
    </NarrowLayout>
  );
}
