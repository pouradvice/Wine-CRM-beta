'use client';
// src/components/ui/FormControl.tsx

import styles from './FormControl.module.css';

interface FormControlProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormControl({
  label,
  htmlFor,
  required,
  error,
  children,
  className,
}: FormControlProps) {
  return (
    <div className={`${styles.field} ${error ? styles.error : ''} ${className ?? ''}`}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {required && <span className={styles.required} aria-hidden="true"> *</span>}
      </label>
      {children}
      {error && <span className={styles.errorMsg} role="alert">{error}</span>}
    </div>
  );
}

// Re-export class names for use in forms that build their own inputs
export { styles as formStyles };
