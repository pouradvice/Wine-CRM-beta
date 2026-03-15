// src/components/layout/WideLayout.tsx
import { Nav } from './Nav';
import styles from './WideLayout.module.css';

interface WideLayoutProps {
  children: React.ReactNode;
  displayName?: string;
  title?: string;
  action?: React.ReactNode;
}

export function WideLayout({ children, displayName, title, action }: WideLayoutProps) {
  return (
    <div className={styles.shell}>
      <Nav displayName={displayName} />
      <main className={styles.main}>
        {title && (
          <div className={styles.heading}>
            <h1 className={styles.title}>{title}</h1>
            {action && <div className={styles.action}>{action}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
