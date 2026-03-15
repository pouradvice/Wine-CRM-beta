'use client';
// src/app/app/crm/reports/layout.tsx
// Sub-navigation for all /reports/* pages.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './ReportsLayout.module.css';

const SUB_LINKS = [
  { href: '/app/crm/reports/dashboard',   label: 'Dashboard' },
  { href: '/app/crm/reports/salesperson', label: 'Salesperson' },
  { href: '/app/crm/reports/manager',     label: 'Manager' },
  { href: '/app/crm/reports/expenses',    label: 'Expenses' },
  { href: '/app/crm/reports/analytics',   label: 'Analytics' },
];

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className={styles.wrapper}>
      <nav className={styles.subNav} aria-label="Reports navigation">
        {SUB_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`${styles.subLink} ${pathname.startsWith(href) ? styles.subLinkActive : ''}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
