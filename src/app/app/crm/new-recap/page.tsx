// src/app/app/crm/new-recap/page.tsx
// Server component: loads active clients, reads the optional plan session
// cookie, and hands off to RecapForm (pre-populated when a same-day plan
// session is active).
//
// Changes from Phase 1 baseline:
//   • getBuyers() removed — RecapForm fetches buyers lazily on client selection.
//   • getClients() now returns PaginatedResult<Client>; we pass only .data.
//   • getProducts() is no longer called here — RecapForm searches server-side.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getAccounts } from '@/lib/data';
import { resolveTeamId } from '@/lib/team';
import { todayLocal } from '@/lib/dateUtils';
import { RecapForm } from '@/components/RecapForm/RecapForm';
import type { Product, RecapFormState } from '@/types';

export const dynamic = 'force-dynamic';

export default async function NewRecapPage({
  searchParams,
}: {
  searchParams: Promise<{ account_id?: string; unplanned?: string }>;
}) {
  const params = await searchParams;
  const sb = await createClient();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);

  // Load all active clients for the account selector.
  // 200 is a safe ceiling for Phase 1; paginate this selector in Phase 2
  // if client counts grow beyond that.
  const { data: clients } = await getAccounts(sb, 'Active', { page: 0, pageSize: 200 }, teamId);

  const displayName =
    user.user_metadata?.full_name ??
    user.email?.split('@')[0] ??
    'Unknown';

  // Read plan session cookie and pre-populate the form if a valid same-day
  // session exists.
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('plan_session_id')?.value;

  let initialValues: Partial<RecapFormState> | undefined;
  let initialProducts: Product[] = [];

  if (sessionId) {
    // Safe: RLS enforces user_id = auth.uid() on daily_plan_sessions.
    const { data: session } = await sb
      .from('daily_plan_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (session && session.plan_date === todayLocal()) {
      // Determine which account to pre-populate
      let nextAccountId: string | undefined;

      const requestedAccountId = params.account_id;

      if (requestedAccountId) {
        // Rep tapped a specific account card
        if ((session.account_ids as string[]).includes(requestedAccountId)) {
          // It's in the plan — use it directly
          nextAccountId = requestedAccountId;
        } else {
          // It's NOT in the plan — unplanned stop; do NOT pre-populate
          nextAccountId = undefined;
        }
      } else if (params.unplanned === 'true') {
        // "Add unplanned stop" button — do NOT pre-populate
        nextAccountId = undefined;
      } else {
        // No query param — use existing fallback: first incomplete account
        nextAccountId = (session.account_ids as string[]).find(
          (id: string) => !(session.completed_account_ids as string[]).includes(id),
        ) ?? (session.account_ids as string[])[0];
      }

      if (nextAccountId) {
        initialValues = { account_id: nextAccountId };
      }

      // Pre-populate products if session has products
      if ((session.product_ids as string[]).length > 0) {
        const { data: products } = await sb
          .from('products')
          .select('*')
          .in('id', session.product_ids as string[])
          .eq('is_active', true);

        initialProducts = (products ?? []) as Product[];
        initialValues = {
          ...initialValues,
          products: initialProducts.map((p) => ({
            product_id:        p.id,
            outcome:           'Discussed' as const,
            order_probability: 0,
            buyer_feedback:    null,
            follow_up_date:    null,
            bill_date:         null,
            menu_placement:    false,
            menu_photo_url:    null,
          })),
        };
      }
    }
  }

  return (
    <div>
      <h1 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: '1.75rem',
        fontWeight: 700,
        color: 'var(--ink)',
        padding: '1.5rem 1.5rem 0',
        margin: 0,
      }}>
        New Recap
      </h1>
      <RecapForm
        key={crypto.randomUUID()}
        clients={clients}
        currentUser={displayName}
        initialValues={initialValues}
        initialProducts={initialProducts}
      />
    </div>
  );
}
