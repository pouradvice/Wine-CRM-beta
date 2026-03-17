// src/lib/team.ts
// Utility for resolving a user's active team_id.
//
// Problem this solves:
//   Every self-signup user gets their own private team via handle_new_user().
//   When an owner later invites them via add_broker_user(), a second
//   team_members row is created.  The old code used .maybeSingle() which
//   silently returns null when two rows exist, causing the page to fall back
//   to user.id — a team_id that matches nothing.
//
// Resolution order:
//   1. user_metadata.team_id is set AND matches a team_members row → use it.
//   2. Exactly one team_members row → use it.
//   3. Multiple rows: prefer a non-owner row (invited to a shared team).
//   4. First row, then user.id.

import type { SupabaseClient, User } from '@supabase/supabase-js';

export async function resolveTeamId(
  sb: SupabaseClient,
  user: User,
): Promise<string> {
  const metaTeamId = user.user_metadata?.team_id as string | undefined;

  const { data: rows } = await sb
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id);

  const memberships = rows ?? [];

  if (memberships.length === 0) {
    return metaTeamId ?? user.id;
  }

  // Prefer the team stored in metadata if it's still a valid membership.
  // After the fix to add_broker_user this will always point to the shared team.
  if (metaTeamId) {
    const match = memberships.find((m) => m.team_id === metaTeamId);
    if (match) return match.team_id;
  }

  if (memberships.length === 1) {
    return memberships[0].team_id;
  }

  // Multiple memberships: user was invited to a shared team.
  // The non-owner row is the shared one; the owner row is their private team.
  const sharedRow = memberships.find((m) => m.role !== 'owner');
  if (sharedRow) return sharedRow.team_id;

  return memberships[0].team_id;
}
