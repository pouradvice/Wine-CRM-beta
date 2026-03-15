// src/components/ui/LoadingSpinner.tsx

import styles from './LoadingSpinner.module.css';

type SpinnerSize = 'sm' | 'md' | 'lg';

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  color?: string;
  label?: string;
}

export function LoadingSpinner({
  size = 'md',
  color = 'var(--wine)',
  label = 'Loading…',
}: LoadingSpinnerProps) {
  return (
    <span
      className={`${styles.spinner} ${styles[size]}`}
      style={{
        borderColor: `${color}22`,
        borderTopColor: color,
      }}
      role="status"
      aria-label={label}
    />
  );
}
