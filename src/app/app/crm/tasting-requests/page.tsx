// src/app/app/crm/tasting-requests/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import { TastingRequestsClient } from '@/components/tasting-requests/TastingRequestsClient';
import type { TastingRequest } from '@/types';

export const dynamic = 'force-dynamic';

export default async function TastingRequestsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);

  const { data: requests } = await sb
    .from('tasting_requests')
    .select(`
      id,
      team_id,
      visitor_email,
      company_name,
      calendly_event_uri,
      status,
      notes,
      created_at,
      tasting_request_items (
        id,
        request_id,
        product_id,
        buyer_notes,
        created_at,
        product:products (
          id,
          wine_name,
          type,
          varietal,
          sku_number
        )
      )
    `)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  return (
    <TastingRequestsClient
      initialRequests={(requests ?? []) as unknown as TastingRequest[]}
      teamId={teamId}
    />
  );
}
