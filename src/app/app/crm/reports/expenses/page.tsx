// src/app/app/crm/reports/expenses/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getExpenseRecaps } from '@/lib/data';
import { ExpensesClient } from '@/components/reports/ExpensesClient';

export const dynamic = 'force-dynamic';

export default async function ExpensesPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const expenses = await getExpenseRecaps(sb);

  return <ExpensesClient expenses={expenses} />;
}
