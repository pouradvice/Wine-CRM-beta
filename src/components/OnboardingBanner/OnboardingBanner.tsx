'use client';

// src/components/OnboardingBanner/OnboardingBanner.tsx
// Dismissible banner shown when a team has no products and no accounts.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './OnboardingBanner.module.css';

const DISMISS_KEY = 'onboarding_banner_dismissed';

interface OnboardingBannerProps {
  show: boolean;
}

export function OnboardingBanner({ show }: OnboardingBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) setVisible(true);
  }, [show]);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  }

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.bannerBody}>
        <span className={styles.bannerIcon}>🍷</span>
        <div className={styles.bannerText}>
          <strong>Get started by importing your data.</strong>{' '}
          Upload your product catalog and account list to unlock the full CRM experience.
        </div>
        <Link href="/app/crm/onboarding/import" className={styles.bannerCta}>
          Import from CSV →
        </Link>
      </div>
      <button
        className={styles.dismiss}
        onClick={dismiss}
        aria-label="Dismiss banner"
      >
        ✕
      </button>
    </div>
  );
}
