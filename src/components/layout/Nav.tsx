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
          <svg
            className={styles.wordmarkLogo}
            viewBox="0 0 36 36"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="18" cy="18" r="18" fill="#541828" />
            <path
              d="M18 8 C14 12 11 17 12 21 C13 25 16 27 18 27 C20 27 23 25 24 21 C25 17 22 12 18 8Z"
              fill="#f5f0e8"
              opacity="0.9"
            />
            <rect x="17" y="27" width="2" height="5" rx="1" fill="#f5f0e8" opacity="0.7" />
          </svg>
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
            <svg
              className={styles.wordmarkLogo}
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="18" cy="18" r="18" fill="#541828" />
              <path
                d="M18 8 C14 12 11 17 12 21 C13 25 16 27 18 27 C20 27 23 25 24 21 C25 17 22 12 18 8Z"
                fill="#f5f0e8"
                opacity="0.9"
              />
              <rect x="17" y="27" width="2" height="5" rx="1" fill="#f5f0e8" opacity="0.7" />
            </svg>
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
