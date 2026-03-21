// src/app/app/suppliers/[id]/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getBillingTerms } from '@/lib/data';
import { BillingTermsForm } from '@/components/billing/BillingTermsForm/BillingTermsForm';
import { DepletionUpload } from '@/components/billing/DepletionUpload/DepletionUpload';
import { GenerateInvoice } from '@/components/billing/GenerateInvoice/GenerateInvoice';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [supplierResult, terms] = await Promise.all([
    sb.from('suppliers').select('id, name').eq('id', id).single(),
    getBillingTerms(sb, id),
  ]);

  if (supplierResult.error || !supplierResult.data) redirect('/app/suppliers');

  const supplier = supplierResult.data as { id: string; name: string };

  // Resolve team_id for the current user
  const { data: membership } = await sb
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!membership) redirect('/login');

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{supplier.name}</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Billing Terms</h2>
        <BillingTermsForm
          supplierId={supplier.id}
          teamId={membership.team_id}
          initialTerms={terms}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Depletion Reports</h2>
        <DepletionUpload
          supplierId={supplier.id}
          teamId={membership.team_id}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Invoices</h2>
        <GenerateInvoice supplierId={supplier.id} teamId={membership.team_id} />
      </section>
    </main>
  );
}
