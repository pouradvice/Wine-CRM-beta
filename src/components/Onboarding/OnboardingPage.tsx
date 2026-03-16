'use client';

// src/components/Onboarding/OnboardingPage.tsx
// First-login onboarding wizard.
// Steps: upload accounts → upload portfolio (products) → done.
// All roles (team_lead, individual, team_member) now include the products step.

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OnboardingRole } from '@/types';
import { Slideover } from '@/components/ui/Slideover';
import { CSVImporter } from '@/components/CSVImporter/CSVImporter';
import styles from './Onboarding.module.css';

// ── Props ─────────────────────────────────────────────────────

interface Props {
  userRole?: OnboardingRole; // default: 'individual'
  userName?: string;         // default: ''
  teamId?: string;           // resolved by the server page
  onComplete?: () => void;
}

// ── Step routing ──────────────────────────────────────────────

type Step = 'accounts' | 'products' | 'done';

const STEPS_BY_ROLE: Record<OnboardingRole, Step[]> = {
  team_lead:   ['accounts', 'products', 'done'],
  individual:  ['accounts', 'products', 'done'],
  team_member: ['accounts', 'products', 'done'],
};

// ── StepAccounts ──────────────────────────────────────────────

interface StepAccountsProps {
  teamId: string;
  importedCount: number;
  onOpenImporter: () => void;
  onNext: () => void;
  onSkip: () => void;
}

function StepAccounts({ teamId: _teamId, importedCount, onOpenImporter, onNext, onSkip }: StepAccountsProps) {
  return (
    <div className={styles.stepPanel}>
      <h2 className={styles.stepTitle}>Import your accounts</h2>
      <p className={styles.stepDesc}>
        Upload a CSV of your restaurants, retailers, and other venues. Our importer will match
        your column headers automatically — no reformatting needed. You can always add more later.
      </p>

      {importedCount > 0 && (
        <div className={styles.importedBadge}>
          ✓ {importedCount} account{importedCount !== 1 ? 's' : ''} imported
        </div>
      )}

      <div className={styles.stepActions}>
        <button type="button" className={styles.primaryBtn} onClick={onOpenImporter}>
          {importedCount > 0 ? 'Import more accounts' : 'Upload CSV'}
        </button>
        {importedCount > 0 && (
          <button type="button" className={styles.primaryBtn} onClick={onNext}>
            Continue →
          </button>
        )}
        <button type="button" className={styles.skipLink} onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ── StepProducts ──────────────────────────────────────────────

interface StepProductsProps {
  teamId: string;
  importedCount: number;
  onOpenImporter: () => void;
  onNext: () => void;
  onSkip: () => void;
}

function StepProducts({ teamId: _teamId, importedCount, onOpenImporter, onNext, onSkip }: StepProductsProps) {
  return (
    <div className={styles.stepPanel}>
      <h2 className={styles.stepTitle}>Import your portfolio</h2>
      <p className={styles.stepDesc}>
        Upload a CSV of the wines and spirits you represent. SKU number and wine name are required;
        everything else is matched automatically from your existing headers.
      </p>

      {importedCount > 0 && (
        <div className={styles.importedBadge}>
          ✓ {importedCount} product{importedCount !== 1 ? 's' : ''} imported
        </div>
      )}

      <div className={styles.stepActions}>
        <button type="button" className={styles.primaryBtn} onClick={onOpenImporter}>
          {importedCount > 0 ? 'Import more products' : 'Upload CSV'}
        </button>
        {importedCount > 0 && (
          <button type="button" className={styles.primaryBtn} onClick={onNext}>
            Continue →
          </button>
        )}
        <button type="button" className={styles.skipLink} onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ── StepDone ──────────────────────────────────────────────────

interface StepDoneProps {
  userName: string;
  onFinish: () => void;
}

function StepDone({ userName, onFinish }: StepDoneProps) {
  const firstName = userName.split(' ')[0];
  return (
    <div className={styles.stepPanel}>
      <div className={styles.doneCheck} aria-hidden>✓</div>
      <h2 className={styles.doneTitle}>
        You&rsquo;re all set{firstName ? `, ${firstName}` : ''}.
      </h2>
      <p className={styles.stepDesc}>
        Pour Advice is ready to help you track placements, manage follow-ups, and grow your book.
      </p>

      <ul className={styles.tipsList}>
        <li className={styles.tipItem}>
          <span className={styles.tipIcon} aria-hidden>📋</span>
          <div>
            <strong>New Recap</strong>
            <p>Log every sales call and track which wines you showed.</p>
          </div>
        </li>
        <li className={styles.tipItem}>
          <span className={styles.tipIcon} aria-hidden>🏪</span>
          <div>
            <strong>Accounts</strong>
            <p>Keep your venues organised by tier, type, and status.</p>
          </div>
        </li>
        <li className={styles.tipItem}>
          <span className={styles.tipIcon} aria-hidden>🍷</span>
          <div>
            <strong>Products</strong>
            <p>Your portfolio lives here — searchable by SKU, varietal, or distributor.</p>
          </div>
        </li>
      </ul>

      <div className={styles.stepActions}>
        <button type="button" className={[styles.primaryBtn, styles.finishBtn].join(' ')} onClick={onFinish}>
          Enter Pour Advice →
        </button>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  accounts: 'Accounts',
  products: 'Portfolio',
  done:     'Done',
};

interface ProgressBarProps {
  steps:     Step[];
  stepIndex: number;
}

function ProgressBar({ steps, stepIndex }: ProgressBarProps) {
  return (
    <div className={styles.progressBar} role="list" aria-label="Onboarding steps">
      {steps.map((step, i) => {
        const isComplete = i < stepIndex;
        const isActive   = i === stepIndex;
        return (
          <React.Fragment key={step}>
            <div
              className={[
                styles.progressStep,
                isComplete ? styles.progressStepComplete : '',
                isActive   ? styles.progressStepActive   : '',
              ].filter(Boolean).join(' ')}
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
            >
              <div className={styles.progressDot}>
                {isComplete ? '✓' : i + 1}
              </div>
              <span className={styles.progressLabel}>{STEP_LABELS[step]}</span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={[
                  styles.progressLine,
                  i < stepIndex ? styles.progressLineComplete : '',
                ].filter(Boolean).join(' ')}
                aria-hidden
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── OnboardingPage (named export) ─────────────────────────────

export function OnboardingPage({
  userRole = 'individual',
  userName = '',
  teamId = '',
  onComplete,
}: Props) {
  const router = useRouter();
  const steps = STEPS_BY_ROLE[userRole];
  const [stepIndex, setStepIndex] = useState(0);
  const [accountsImported, setAccountsImported] = useState(0);
  const [productsImported, setProductsImported] = useState(0);

  // Slideover state — one instance shared between account and product steps
  const [sliderOpen, setSliderOpen]   = useState(false);
  const [sliderType, setSliderType]   = useState<'clients' | 'products'>('clients');

  const advance = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));

  const openImporter = (type: 'clients' | 'products') => {
    setSliderType(type);
    setSliderOpen(true);
  };

  const handleImporterDone = (succeeded: number) => {
    if (sliderType === 'clients') {
      setAccountsImported((n) => n + succeeded);
    } else {
      setProductsImported((n) => n + succeeded);
    }
    setSliderOpen(false);
  };

  const handleFinish = async () => {
    try {
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accounts_imported: accountsImported,
          products_imported: productsImported,
        }),
      });
    } catch {
      try { localStorage.setItem('onboarding_complete', '1'); } catch { /* storage blocked */ }
    }
    onComplete?.();
    router.push('/app/crm/clients');
  };

  const currentStep = steps[stepIndex];

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.brandMark}>Pour Advice</span>
          <ProgressBar steps={steps} stepIndex={stepIndex} />
        </div>

        {currentStep === 'accounts' && (
          <StepAccounts
            teamId={teamId}
            importedCount={accountsImported}
            onOpenImporter={() => openImporter('clients')}
            onNext={advance}
            onSkip={advance}
          />
        )}
        {currentStep === 'products' && (
          <StepProducts
            teamId={teamId}
            importedCount={productsImported}
            onOpenImporter={() => openImporter('products')}
            onNext={advance}
            onSkip={advance}
          />
        )}
        {currentStep === 'done' && (
          <StepDone userName={userName} onFinish={handleFinish} />
        )}
      </div>

      {/* CSV importer slideover — shared for both accounts and products */}
      <Slideover
        open={sliderOpen}
        onClose={() => setSliderOpen(false)}
        title={sliderType === 'clients' ? 'Import Accounts' : 'Import Portfolio'}
      >
        {sliderOpen && (
          <CSVImporter
            type={sliderType}
            teamId={teamId}
            onComplete={handleImporterDone}
          />
        )}
      </Slideover>
    </div>
  );
}

// ── Default export (Next.js page wrapper) ─────────────────────

export default OnboardingPage;
