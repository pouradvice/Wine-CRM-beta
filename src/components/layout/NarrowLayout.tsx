// src/components/layout/NarrowLayout.tsx
import styles from './NarrowLayout.module.css';

interface NarrowLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function NarrowLayout({ children, title, subtitle }: NarrowLayoutProps) {
  return (
    <div className={styles.wrap}>
      {(title || subtitle) && (
        <div className={styles.header}>
          {title && <h1 className={styles.title}>{title}</h1>}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
