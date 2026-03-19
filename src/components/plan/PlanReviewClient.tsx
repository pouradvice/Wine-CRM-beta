'use client';
// src/components/plan/PlanReviewClient.tsx
// Sprint 3 — Plan Review Client Component
//
// Renders the day's account list with context signals:
//   • Value tier badge
//   • Last visit date (or "Never")
//   • Open follow-ups count
//   • Bag products (same for all accounts)
//   • Completion state (✓ or "Log Recap" button)
//
// No client-side state polling — the page is force-dynamic and re-renders
// fresh on every navigation back to it.

import { useRouter } from 'next/navigation';
import type { DailyPlanSession, ValueTier, WineType } from '@/types';
import { formatDateDisplay } from '@/lib/dateUtils';
import styles from './PlanReviewClient.module.css';

// ── Types ─────────────────────────────────────────────────────

export interface AccountWithContext {
  id:              string;
  name:            string;
  value_tier:      ValueTier | null;
  last_visit_date: string | null;
  open_follow_ups: number;
}

interface Props {
  session:              DailyPlanSession;
  accountContext:       AccountWithContext[];
  sessionProducts:      { id: string; wine_name: string; sku_number: string; type: WineType | null }[];
  allDone:              boolean;
  unplannedAccountIds:  string[];
}

// ── Helpers ───────────────────────────────────────────────────

const TIER_LABEL: Record<ValueTier, string> = { A: 'A', B: 'B', C: 'C' };

// ── Component ─────────────────────────────────────────────────

export function PlanReviewClient({ session, accountContext, sessionProducts, allDone, unplannedAccountIds }: Props) {
  const router = useRouter();

  // Build a map for O(1) context lookup
  const contextById = new Map(accountContext.map((a) => [a.id, a]));

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Today&apos;s Route</h1>

      {allDone && (
        <div className={styles.doneBanner}>
          <span className={styles.doneBannerIcon}>🎉</span>
          <span>All accounts logged. Great work today.</span>
          <button
            type="button"
            className={styles.doneBtn}
            onClick={() => router.push('/app/crm/history')}
          >
            Done
          </button>
        </div>
      )}

      <div className={styles.list}>
        {session.account_ids.map((accountId) => {
          const ctx = contextById.get(accountId);
          if (!ctx) return null;

          const isCompleted = session.completed_account_ids.includes(accountId);
          const isUnplanned = unplannedAccountIds.includes(accountId);

          return (
            <div
              key={accountId}
              className={`${styles.card} ${isCompleted ? styles.cardDone : ''}`}
            >
              {/* ── Account header ── */}
              <div className={styles.cardHeader}>
                <div className={styles.accountMeta}>
                  <span className={styles.accountName}>{ctx.name}</span>
                  {ctx.value_tier && (
                    <span className={`${styles.tierBadge} ${styles[`tier${ctx.value_tier}`]}`}>
                      {TIER_LABEL[ctx.value_tier]}
                    </span>
                  )}
                </div>

                {/* ── Action ── */}
                <div className={styles.cardAction}>
                  {isCompleted ? (
                    <>
                      <span className={styles.completedBadge}>✓ Done</span>
                      {isUnplanned && (
                        <span className={styles.unplannedBadge}>Unplanned</span>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.logBtn}
                      onClick={() => router.push(`/app/crm/new-recap?account_id=${accountId}`)}
                    >
                      Log Recap
                    </button>
                  )}
                </div>
              </div>

              {/* ── Context signals ── */}
              <div className={styles.signals}>
                <span className={styles.signal}>
                  <span className={styles.signalLabel}>Last visit</span>
                  <span className={styles.signalValue}>
                    {formatDateDisplay(ctx.last_visit_date)}
                  </span>
                </span>

                {ctx.open_follow_ups > 0 && (
                  <span className={`${styles.signal} ${styles.signalFollowUp}`}>
                    <span className={styles.signalLabel}>Follow-ups</span>
                    <span className={styles.signalValue}>{ctx.open_follow_ups} open</span>
                  </span>
                )}
              </div>

              {/* ── Bag products ── */}
              {sessionProducts.length > 0 && (
                <div className={styles.products}>
                  {sessionProducts.map((p) => (
                    <span key={p.id} className={styles.productChip}>
                      <span className={styles.sku}>{p.sku_number}</span>
                      {' '}{p.wine_name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!allDone && (
          <button
            type="button"
            className={styles.unplannedBtn}
            onClick={() => router.push('/app/crm/new-recap?unplanned=true')}
          >
            + Add unplanned stop
          </button>
        )}
      </div>
    </div>
  );
}
