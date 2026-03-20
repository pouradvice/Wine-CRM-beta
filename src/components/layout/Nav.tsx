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
  { href: '/app/crm/history',     label: 'History' },
  { href: '/app/crm/follow-ups',  label: 'Follow-Ups' },
  { href: '/app/crm/reports',     label: 'Reports' },
];

const OWNER_EXTRA = { href: '/app/crm/team', label: 'Team' };

interface NavProps {
  displayName?: string;
  isOwner?: boolean;
}

export function Nav({ displayName, isOwner }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = isOwner ? [...NAV_LINKS, OWNER_EXTRA] : NAV_LINKS;
  const isActive = (href: string) => pathname.startsWith(href);
  const isNewRecapActive = isActive('/app/crm/new-recap');

  const handleSignOut = async () => {
    const sb = createClient();
    await sb.auth.signOut();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className={styles.mobileTopBar}>
        <Link href="/app/crm/new-recap" className={styles.mobileWordmark}>
          {/* Logo: place public/images/pour-advice-logo.png in the public/images/ directory */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/pour-advice-logo.png" alt="" className={styles.wordmarkLogo} aria-hidden="true" />
          Pour Advice
        </Link>
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

      {/* Sidebar backdrop (mobile) */}
      {mobileOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <nav className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.brand}>
          <Link href="/app/crm/new-recap" className={styles.wordmark}>
            {/* Logo: place public/images/pour-advice-logo.png in the public/images/ directory */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/pour-advice-logo.png" alt="" className={styles.wordmarkLogo} aria-hidden="true" />
            Pour Advice
          </Link>
        </div>

        <div className={styles.ctaWrap}>
          <Link
            href="/app/crm/new-recap"
            className={`${styles.ctaBtn} ${isNewRecapActive ? styles.ctaBtnActive : ''}`}
            onClick={(e) => {
              setMobileOpen(false);
              if (isNewRecapActive) {
                e.preventDefault();
                window.location.href = '/app/crm/new-recap';
              }
            }}
          >
            + New Recap
          </Link>
        </div>

        <ul className={styles.navList} role="list">
          {links.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className={`${styles.navBtn} ${isActive(href) ? styles.navBtnActive : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        <div className={styles.userSection}>
          {displayName && (
            <span className={styles.userName}>{displayName}</span>
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
      </nav>
    </>
  );
}
