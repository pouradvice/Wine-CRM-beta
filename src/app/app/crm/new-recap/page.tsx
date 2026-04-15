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

type SearchParams = {
  account_id?: string;
  unplanned?: string;
  tasting_request_id?: string;
  company_name?: string;
  product_id?: string | string[];
  buyer_note?: string | string[];
};

type TastingRequestContext = {
  id: string;
  company_name: string | null;
  visitor_email: string;
};

type MatchCandidate = { id: string; name: string };

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickBestAccountMatch(companyName: string, candidates: MatchCandidate[]): MatchCandidate | null {
  if (!companyName || candidates.length === 0) return null;
  const normalizedCompany = normalizeName(companyName);
  const ranked = [...candidates].sort((a, b) => {
    const an = normalizeName(a.name);
    const bn = normalizeName(b.name);
    const score = (candidate: string) => {
      if (candidate === normalizedCompany) return 0;
      if (candidate.startsWith(normalizedCompany) || normalizedCompany.startsWith(candidate)) return 1;
      if (candidate.includes(normalizedCompany) || normalizedCompany.includes(candidate)) return 2;
      return 3;
    };
    const sa = score(an);
    const sb = score(bn);
    if (sa !== sb) return sa - sb;
    return Math.abs(a.name.length - companyName.length) - Math.abs(b.name.length - companyName.length);
  });
  return ranked[0] ?? null;
}

export default async function NewRecapPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
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
  const tastingRequestId = params.tasting_request_id?.trim();

  let initialValues: Partial<RecapFormState> | undefined;
  let initialProducts: Product[] = [];
  let tastingRequestContext: TastingRequestContext | null = null;

  if (tastingRequestId) {
    const { data: tastingRequest } = await sb
      .from('tasting_requests')
      .select(`
        id,
        team_id,
        visitor_email,
        company_name,
        notes,
        tasting_request_items (
          id,
          request_id,
          product_id,
          buyer_notes,
          created_at
        )
      `)
      .eq('id', tastingRequestId)
      .eq('team_id', teamId)
      .maybeSingle();

    const requestProductItems = (tastingRequest?.tasting_request_items ?? []) as Array<{
      product_id: string;
      buyer_notes: string | null;
    }>;
    const requestProductIds = requestProductItems.map((item) => item.product_id);
    let requestProducts: Product[] = [];
    if (requestProductIds.length > 0) {
      const { data: reqProducts } = await sb
        .from('products')
        .select('*')
        .in('id', requestProductIds)
        .eq('is_active', true);
      requestProducts = (reqProducts ?? []) as Product[];
    }

    const fallbackProductIds = toArray(params.product_id);
    const fallbackBuyerNotes = toArray(params.buyer_note);

    let productsForForm: Product[] = requestProducts;
    let productRows = requestProductItems
      .map((item) => ({
        product_id:        item.product_id,
        outcome:           'Discussed' as const,
        order_probability: 0,
        buyer_feedback:    item.buyer_notes ?? '',
        follow_up_date:    '',
        bill_date:         '',
        menu_placement:    false,
        menu_photo_url:    null,
        retail_3cs_order:  false,
      }));

    if (!tastingRequest && fallbackProductIds.length > 0) {
      const { data: fallbackProducts } = await sb
        .from('products')
        .select('*')
        .in('id', fallbackProductIds)
        .eq('is_active', true);
      productsForForm = (fallbackProducts ?? []) as Product[];
      productRows = productsForForm.map((p, i) => ({
        product_id:        p.id,
        outcome:           'Discussed' as const,
        order_probability: 0,
        buyer_feedback:    fallbackBuyerNotes[i] ?? '',
        follow_up_date:    '',
        bill_date:         '',
        menu_placement:    false,
        menu_photo_url:    null,
        retail_3cs_order:  false,
      }));
    }

    const availableProductIds = new Set(productsForForm.map((p) => p.id));
    productRows = productRows.filter((row) => availableProductIds.has(row.product_id));

    initialProducts = productsForForm;

    const companyName = tastingRequest?.company_name?.trim() || params.company_name?.trim() || '';
    let matchedAccountId = '';
    if (companyName) {
      const searchTerm = companyName.replace(/[%_]/g, '');
      const { data: accountCandidates } = await sb
        .from('accounts')
        .select('id, name')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .ilike('name', `%${searchTerm}%`)
        .limit(10);
      const bestMatch = pickBestAccountMatch(companyName, (accountCandidates ?? []) as MatchCandidate[]);
      matchedAccountId = bestMatch?.id ?? '';
    }

    const notesParts = [
      tastingRequest?.notes?.trim() || null,
      tastingRequest?.visitor_email ? `Visitor email: ${tastingRequest.visitor_email}` : null,
    ].filter(Boolean);

    initialValues = {
      ...initialValues,
      visit_date: todayLocal(),
      account_id: matchedAccountId,
      notes: notesParts.length > 0 ? notesParts.join('\n\n') : null,
      products: productRows,
    };

    if (tastingRequest) {
      tastingRequestContext = {
        id: tastingRequest.id,
        company_name: tastingRequest.company_name,
        visitor_email: tastingRequest.visitor_email,
      };
    } else {
      tastingRequestContext = {
        id: tastingRequestId,
        company_name: params.company_name ?? null,
        visitor_email: '',
      };
    }
  } else if (sessionId) {
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
            retail_3cs_order:  false,
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
        tastingRequestContext={tastingRequestContext}
      />
    </div>
  );
}
