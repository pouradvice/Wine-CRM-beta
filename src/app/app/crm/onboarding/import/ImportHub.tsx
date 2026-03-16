'use client';

// src/app/app/crm/onboarding/import/ImportHub.tsx
// Client component: shows two cards or the active importer wizard

import { useState } from 'react';
import { CSVImporter, type ImportType } from '@/components/CSVImporter/CSVImporter';
import styles from './ImportHub.module.css';

interface ImportHubProps {
  teamId: string;
}

export function ImportHub({ teamId }: ImportHubProps) {
  const [active, setActive] = useState<ImportType | null>(null);

  if (active) {
    return (
      <div>
        <button className={styles.backLink} onClick={() => setActive(null)}>
          ← Back to import options
        </button>
        <CSVImporter type={active} teamId={teamId} />
      </div>
    );
  }

  return (
    <div className={styles.cards}>
      <button
        className={styles.card}
        onClick={() => setActive('products')}
      >
        <div className={styles.cardIcon}>🍷</div>
        <h2 className={styles.cardTitle}>Import Products</h2>
        <p className={styles.cardDesc}>
          Upload your product catalog. We&apos;ll match your columns to our schema.
        </p>
        <span className={styles.cardCta}>Get started →</span>
      </button>

      <button
        className={styles.card}
        onClick={() => setActive('clients')}
      >
        <div className={styles.cardIcon}>🏢</div>
        <h2 className={styles.cardTitle}>Import Accounts</h2>
        <p className={styles.cardDesc}>
          Upload your client list. Map your fields and we&apos;ll handle the rest.
        </p>
        <span className={styles.cardCta}>Get started →</span>
      </button>
    </div>
  );
}
