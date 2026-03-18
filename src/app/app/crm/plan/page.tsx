// src/app/app/crm/plan/page.tsx
// "Start Your Day" landing — two large CTA buttons directing the rep to either
// begin their daily plan from accounts or from products.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function PlanPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  // Verify team membership — same pattern as every other page.
  await resolveTeamId(sb, user);

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Start Your Day</h1>
      <p className={styles.subheading}>How would you like to build today's plan?</p>

      <div className={styles.ctaGrid}>
        <a href="/app/crm/plan/accounts" className={styles.ctaCard}>
          <span className={styles.ctaIcon}>🏪</span>
          <span className={styles.ctaTitle}>Start with Accounts</span>
          <span className={styles.ctaDesc}>
            Choose the accounts you plan to visit today, then see the best
            products to bring for each one.
          </span>
        </a>

        <a href="/app/crm/plan/products" className={styles.ctaCard}>
          <span className={styles.ctaIcon}>🍷</span>
          <span className={styles.ctaTitle}>Start with Products</span>
          <span className={styles.ctaDesc}>
            Pick the wines you want to push today, then see which accounts are
            most likely to buy them.
          </span>
        </a>
      </div>
    </main>
  );
}
