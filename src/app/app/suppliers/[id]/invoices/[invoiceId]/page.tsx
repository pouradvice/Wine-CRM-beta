// src/app/app/suppliers/[id]/invoices/[invoiceId]/page.tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { SupplierInvoice, SupplierInvoiceLineItem, InvoiceStatus } from '@/types';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

function statusClass(status: InvoiceStatus): string {
  switch (status) {
    case 'Paid':     return styles.badgePaid;
    case 'Sent':     return styles.badgeSent;
    case 'Reviewed': return styles.badgeReviewed;
    case 'Disputed': return styles.badgeDisputed;
    case 'Void':     return styles.badgeVoid;
    default:         return styles.badgeDraft;
  }
}

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtPeriod(period: string): string {
  // period is 'YYYY-MM-DD', display as 'Month YYYY'
  const d = new Date(period + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
}) {
  const { id: supplierId, invoiceId } = await params;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  // Verify membership
  const { data: membership } = await sb
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!membership) redirect('/login');
  if (membership.role !== 'owner') redirect('/app/crm/reports');

  // Fetch invoice + line items + supplier name in parallel
  const [invoiceResult, lineItemsResult] = await Promise.all([
    sb
      .from('supplier_invoices')
      .select('*, supplier:suppliers(name)')
      .eq('id', invoiceId)
      .eq('supplier_id', supplierId)
      .eq('team_id', membership.team_id)
      .single(),
    sb
      .from('supplier_invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('line_type')
      .order('salesperson'),
  ]);

  if (invoiceResult.error || !invoiceResult.data) {
    redirect(`/app/suppliers/${supplierId}`);
  }

  const invoice = invoiceResult.data as SupplierInvoice & { supplier: { name: string } | null };
  const lineItems: SupplierInvoiceLineItem[] = (lineItemsResult.data ?? []) as SupplierInvoiceLineItem[];

  const supplierName = invoice.supplier?.name ?? 'Supplier';

  return (
    <main className={styles.page}>
      {/* Back nav */}
      <Link href={`/app/suppliers/${supplierId}`} className={styles.backLink}>
        ← {supplierName}
      </Link>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.heading}>Invoice</h1>
          <p className={styles.period}>{fmtPeriod(invoice.billing_period)}</p>
        </div>
        <span className={`${styles.badge} ${statusClass(invoice.status)}`}>
          {invoice.status}
        </span>
      </div>

      {/* KPI strip */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiValue}>{invoice.placements_count}</span>
          <span className={styles.kpiLabel}>Placements</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiValue}>{invoice.demo_count}</span>
          <span className={styles.kpiLabel}>Demos</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiValue}>{invoice.event_count}</span>
          <span className={styles.kpiLabel}>Events</span>
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiCardTotal}`}>
          <span className={`${styles.kpiValue} ${styles.kpiValueWine}`}>{fmt(invoice.subtotal)}</span>
          <span className={styles.kpiLabel}>Subtotal</span>
        </div>
      </div>

      {/* Square section */}
      {invoice.square_invoice_url ? (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Square Invoice</h2>
          <div className={styles.squareCard}>
            <div className={styles.squareInfo}>
              {invoice.square_invoice_id && (
                <span className={styles.squareId}>ID: {invoice.square_invoice_id}</span>
              )}
              {invoice.sent_at && (
                <span className={styles.squareMeta}>
                  Sent {new Date(invoice.sent_at).toLocaleDateString()}
                </span>
              )}
              {invoice.paid_at && (
                <span className={styles.squareMeta}>
                  Paid {new Date(invoice.paid_at).toLocaleDateString()}
                </span>
              )}
            </div>
            <a
              href={invoice.square_invoice_url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.squareBtn}
            >
              Open in Square →
            </a>
          </div>
        </section>
      ) : (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Square Invoice</h2>
          <p className={styles.emptyNote}>
            No Square invoice linked yet. Send this invoice through Square to generate a payment link.
          </p>
        </section>
      )}

      {/* Line items */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Line Items</h2>
        {lineItems.length === 0 ? (
          <p className={styles.emptyNote}>No line items on this invoice.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Rep</th>
                  <th className={styles.numCell}>Qty</th>
                  <th className={styles.numCell}>Rate</th>
                  <th className={styles.numCell}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className={styles.lineType}>{item.line_type}</span>
                    </td>
                    <td className={styles.descCell}>{item.description}</td>
                    <td>{item.salesperson ?? '—'}</td>
                    <td className={styles.numCell}>{item.quantity}</td>
                    <td className={styles.numCell}>{fmt(item.unit_rate)}</td>
                    <td className={`${styles.numCell} ${styles.amountCell}`}>{fmt(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className={styles.totalLabel}>Total</td>
                  <td className={`${styles.numCell} ${styles.totalAmount}`}>{fmt(invoice.subtotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Notes */}
      {invoice.notes && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Notes</h2>
          <p className={styles.notes}>{invoice.notes}</p>
        </section>
      )}

      {/* Footer meta */}
      <p className={styles.footerMeta}>
        Created {new Date(invoice.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
        {invoice.updated_at !== invoice.created_at && (
          <> · Updated {new Date(invoice.updated_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}</>
        )}
      </p>
    </main>
  );
}
