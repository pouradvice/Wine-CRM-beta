'use client';
// src/components/follow-ups/FollowUpsClient.tsx

import { useState } from 'react';
import { OutcomeBadge } from '@/components/ui/Badge';
import type { FollowUpQueueRow } from '@/types';
import styles from './FollowUpsClient.module.css';

interface FollowUpsClientProps {
  initialFollowUps: FollowUpQueueRow[];
  totalCount: number;
}

export function FollowUpsClient({ initialFollowUps }: FollowUpsClientProps) {
  const [items, setItems] = useState<FollowUpQueueRow[]>(initialFollowUps);
  const [snoozeId, setSnoozeId] = useState<string | null>(null);
  const [snoozeDates, setSnoozeDates] = useState<Record<string, string>>({});

  const open = items.filter((i) => i.status === 'Open');
  const snoozed = items.filter((i) => i.status === 'Snoozed');

  const patchItem = async (id: string, body: { status: 'Completed' | 'Snoozed'; snoozed_until?: string }) => {
    try {
      const res = await fetch(`/api/follow-ups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      return true;
    } catch {
      alert('Failed to update follow-up. Please try again.');
      return false;
    }
  };

  const handleComplete = async (id: string) => {
    const ok = await patchItem(id, { status: 'Completed' });
    if (ok) setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSnooze = async (id: string) => {
    const date = snoozeDates[id];
    if (!date) {
      alert('Please pick a snooze date.');
      return;
    }
    const ok = await patchItem(id, { status: 'Snoozed', snoozed_until: date });
    if (ok) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, status: 'Snoozed', snoozed_until: date } : i,
        ),
      );
      setSnoozeId(null);
    }
  };

  const renderItem = (item: FollowUpQueueRow) => {
    const isSnoozedItem = item.status === 'Snoozed';
    return (
      <div
        key={item.id}
        className={`${styles.item} ${item.is_overdue ? styles.itemOverdue : ''} ${isSnoozedItem ? styles.itemSnoozed : ''}`}
      >
        <div>
          <div className={styles.dueDate}>{item.due_date ?? 'No date'}</div>
          {item.is_overdue && !isSnoozedItem && (
            <span className={styles.overduePill}>Overdue</span>
          )}
          {isSnoozedItem && item.snoozed_until && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Until {item.snoozed_until}
            </div>
          )}
        </div>

        <div className={styles.meta}>
          <span className={styles.client}>{item.client_name}</span>
          {item.buyer_name && <span className={styles.buyer}>{item.buyer_name}</span>}
          <span className={styles.wine}>
            <span className={styles.sku}>{item.sku_number}</span>{' '}
            {item.wine_name}
          </span>
          <span className={styles.salesperson}>{item.salesperson}</span>
          {item.bill_date && (
            <span className={styles.billDate}>Bill date: {item.bill_date}</span>
          )}
        </div>

        <OutcomeBadge outcome={item.outcome} />

        <div className={styles.actions}>
          {!isSnoozedItem && (
            <>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnComplete}`}
                onClick={() => handleComplete(item.id)}
              >
                ✓ Complete
              </button>

              {snoozeId === item.id ? (
                <div className={styles.snoozePopover}>
                  <input
                    type="date"
                    className={styles.snoozeInput}
                    value={snoozeDates[item.id] ?? ''}
                    onChange={(e) =>
                      setSnoozeDates((d) => ({ ...d, [item.id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => handleSnooze(item.id)}
                  >
                    Set
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setSnoozeId(null)}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => setSnoozeId(item.id)}
                >
                  Snooze
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <h1 className={styles.pageTitle}>Follow-Ups</h1>

      <h2 className={styles.sectionTitle} style={{ marginTop: 0 }}>
        Open ({open.length})
      </h2>

      {open.length === 0 ? (
        <div className={styles.empty}>
          No open follow-ups. Great work keeping up with your accounts!
        </div>
      ) : (
        <div className={styles.list}>
          {open.sort((a, b) => {
            // Overdue first, then by due date
            if (a.is_overdue && !b.is_overdue) return -1;
            if (!a.is_overdue && b.is_overdue) return 1;
            return (a.due_date ?? '').localeCompare(b.due_date ?? '');
          }).map(renderItem)}
        </div>
      )}

      {snoozed.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>Snoozed ({snoozed.length})</h2>
          <div className={styles.list}>
            {snoozed.map(renderItem)}
          </div>
        </>
      )}
    </>
  );
}
