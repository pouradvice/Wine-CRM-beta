// src/app/api/team/route.ts
// Team management API — add / remove members.
// Caller must be an owner of the team.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

// ── POST /api/team  — add a member ──────────────────────────
export async function POST(req: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify the caller is an owner
  const { data: callerRow } = await sb
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .maybeSingle();

  if (!callerRow || callerRow.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — only owners can manage team members' }, { status: 403 });
  }

  const body = await req.json() as { email?: string; role?: string };
  const email = (body.email ?? '').trim().toLowerCase();
  const role  = (body.role  ?? 'member').trim();

  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });
  if (!['owner', 'admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'role must be owner, admin, or member' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc.rpc('add_broker_user', {
    p_email:   email,
    p_role:    role,
    p_team_id: callerRow.team_id,
  });

  if (error) {
    // Return the Postgres error message so the UI can surface it
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.log(`[team] added ${email} to team ${callerRow.team_id}`);

  // Look up the newly added user so the UI can append them immediately
  const { data: memberRow } = await svc
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', callerRow.team_id)
    .eq('role', role)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let newMember: { user_id: string; role: string; email: string; display_name: string } | null = null;
  if (memberRow) {
    const { data: userData } = await svc.auth.admin.getUserById(memberRow.user_id);
    const authUser = userData?.user;
    newMember = {
      user_id:      memberRow.user_id,
      role:         memberRow.role,
      email:        authUser?.email ?? email,
      display_name: (authUser?.user_metadata?.full_name as string | undefined) ?? '',
    };
  }

  return NextResponse.json({ ok: true, member: newMember });
}

// ── DELETE /api/team  — remove a member ─────────────────────
export async function DELETE(req: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify the caller is an owner
  const { data: callerRow } = await sb
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .maybeSingle();

  if (!callerRow || callerRow.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — only owners can manage team members' }, { status: 403 });
  }

  const body = await req.json() as { userId?: string };
  const targetUserId = (body.userId ?? '').trim();

  if (!targetUserId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  // Owners cannot remove themselves
  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'You cannot remove yourself from the team' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from('team_members')
    .delete()
    .eq('user_id', targetUserId)
    .eq('team_id', callerRow.team_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

// ── PATCH /api/team  — update a member's role ───────────────
export async function PATCH(req: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: callerRow } = await sb
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .maybeSingle();

  if (!callerRow || callerRow.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — only owners can manage team members' }, { status: 403 });
  }

  const body = await req.json() as { userId?: string; role?: string };
  const targetUserId = (body.userId ?? '').trim();
  const newRole = (body.role ?? '').trim();

  if (!targetUserId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  if (!['owner', 'admin', 'member'].includes(newRole)) {
    return NextResponse.json({ error: 'role must be owner, admin, or member' }, { status: 400 });
  }
  // Prevent owners from changing their own role (avoid accidental self-demotion)
  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from('team_members')
    .update({ role: newRole })
    .eq('user_id', targetUserId)
    .eq('team_id', callerRow.team_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
