'use client';
// src/components/layout/Nav.tsx

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './Nav.module.css';

const NAV_LINKS = [
  { href: '/app/crm/clients',     label: 'Accounts' },
  { href: '/app/crm/products',    label: 'Products' },
  { href: '/app/crm/new-recap',   label: 'New Recap' },
  { href: '/app/crm/history',     label: 'History' },
  { href: '/app/crm/follow-ups',  label: 'Follow-Ups' },
  { href: '/app/crm/reports',     label: 'Reports' },
];

const OWNER_NAV_LINKS = [
  ...NAV_LINKS,
  { href: '/app/crm/team', label: 'Team' },
];

interface NavProps {
  displayName?: string;
  isOwner?: boolean;
}

export function Nav({ displayName, isOwner }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = isOwner ? OWNER_NAV_LINKS : NAV_LINKS;
  const isActive = (href: string) => pathname.startsWith(href);

  const handleSignOut = async () => {
    const sb = createClient();
    await sb.auth.signOut();
    router.push('/login');
  };

  return (
    <>
      <nav className={styles.nav}>
        <div className={styles.inner}>
          <Link href="/app/crm/clients" className={styles.wordmark}>
            Pour Advice
          </Link>

          {/* Desktop tabs */}
          <ul className={styles.tabs} role="list">
            {links.map(({ href, label }) => (
              <li key={href} className={styles.tab}>
                <Link
                  href={href}
                  className={`${styles.tabLink} ${isActive(href) ? styles.tabLinkActive : ''}`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop user area */}
          <div className={styles.userArea}>
            {displayName && (
              <span className={styles.userName}>{displayName}</span>
            )}
            <button
              type="button"
              className={styles.signOutBtn}
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </div>

          {/* Mobile hamburger — outside main container to avoid z-index conflicts */}
          <button
            type="button"
            className={styles.hamburger}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            <span className={styles.hamburgerIcon}>
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile dropdown — rendered outside nav at portal level via fixed positioning */}
      {mobileOpen && (
        <div className={styles.mobileMenu}>
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`${styles.mobileLink} ${isActive(href) ? styles.mobileLinkActive : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              {label}
            </Link>
          ))}
          <div className={styles.mobileDivider} />
          <div className={styles.mobileUserArea}>
            {displayName && (
              <span className={styles.mobileUserName}>{displayName}</span>
            )}
            <button
              type="button"
              className={styles.signOutBtn}
              onClick={() => {
                setMobileOpen(false);
                handleSignOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
