// src/components/ui/Card.tsx

import styles from './Card.module.css';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Card({ children, title, headerAction, footer, className }: CardProps) {
  return (
    <div className={`${styles.card} ${className ?? ''}`}>
      {(title || headerAction) && (
        <div className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {headerAction && <div className={styles.headerAction}>{headerAction}</div>}
        </div>
      )}
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
