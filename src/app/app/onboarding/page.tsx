// src/app/app/onboarding/page.tsx
// Server component — redirects if onboarding already completed,
// otherwise renders the client-side OnboardingPage wizard.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingPage } from '@/components/Onboarding/OnboardingPage';
import type { OnboardingRole } from '@/types';

export const dynamic = 'force-dynamic';

export default async function OnboardingRoute() {
  const sb = await createClient();

  // 1. Auth guard
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // 2. If already completed, skip wizard
  const { data: onboardingState } = await sb
    .from('user_onboarding_state')
    .select('completed_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (onboardingState?.completed_at != null) {
    redirect('/app/crm/accounts');
  }

  // 3. Resolve onboarding role from team_members.
  //    The handle_new_user() auth trigger (03_onboarding.sql §0) inserts
  //    every self-signup user as 'owner' of a fresh team, so memberRow
  //    should always be present.  The 'individual' fallback is a safety
  //    net for edge cases (e.g. users created before the trigger existed).
  const { data: memberRow } = await sb
    .from('team_members')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  let userRole: OnboardingRole;
  if (!memberRow) {
    // Edge case: no team row yet (pre-trigger accounts or provisioning gap).
    // Treat as individual — full step set, data keyed to user.id.
    userRole = 'individual';
  } else if (memberRow.role === 'owner' || memberRow.role === 'admin') {
    userRole = 'team_lead';
  } else {
    // 'member' — invited into an existing team
    userRole = 'team_member';
  }

  // 4. Display name
  const displayName: string =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split('@')[0] ??
    '';

  return <OnboardingPage userRole={userRole} userName={displayName} />;
}
