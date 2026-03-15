// src/components/ui/Badge.tsx

import styles from './Badge.module.css';

type BadgeVariant =
  | 'yes'
  | 'later'
  | 'maybe'
  | 'no'
  | 'discussed'
  | 'active'
  | 'prospective'
  | 'former';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
}

const OUTCOME_MAP: Record<string, BadgeVariant> = {
  'Yes Today': 'yes',
  'Yes Later': 'later',
  'Maybe Later': 'maybe',
  'No': 'no',
  'Discussed': 'discussed',
  'Active': 'active',
  'Prospective': 'prospective',
  'Former': 'former',
};

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]}`}>
      {children}
    </span>
  );
}

/** Convenience: derive variant from an outcome or status string */
export function OutcomeBadge({ outcome }: { outcome: string }) {
  const variant: BadgeVariant = OUTCOME_MAP[outcome] ?? 'discussed';
  return <Badge variant={variant}>{outcome}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const variant: BadgeVariant = OUTCOME_MAP[status] ?? 'former';
  return <Badge variant={variant}>{status}</Badge>;
}
