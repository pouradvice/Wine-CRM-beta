'use client';
// src/components/layout/Nav.tsx

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './Nav.module.css';

const NAV_LINKS = [
  { href: '/app/crm/clients',    label: 'Accounts' },
  { href: '/app/crm/products',   label: 'Products' },
  { href: '/app/crm/history',    label: 'History' },
  { href: '/app/crm/follow-ups', label: 'Follow-Ups' },
  { href: '/app/crm/reports',    label: 'Reports' },
];

const OWNER_EXTRAS = [
  { href: '/app/crm/team',   label: 'Team' },
  { href: '/app/suppliers',  label: 'Suppliers' },
];

// Minimal inline SVG icons for bottom nav
const ICONS: Record<string, React.ReactNode> = {
  '/app/crm/clients': (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="6" r="3" />
      <path d="M2 18c0-3.314 2.686-6 6-6s6 2.686 6 6" />
      <path d="M14 3a3 3 0 0 1 0 6" />
      <path d="M18 18c0-2.761-1.79-5.1-4-5.8" />
    </svg>
  ),
  '/app/crm/products': (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="16" height="11" rx="1" />
      <path d="M6 7V5a4 4 0 0 1 8 0v2" />
    </svg>
  ),
  '/app/crm/history': (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6v4l3 3" />
    </svg>
  ),
  '/app/crm/follow-ups': (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="14" height="14" rx="1" />
      <path d="M3 8h14" />
      <path d="M8 2v4M12 2v4" />
      <path d="M7 12h2m2 0h2" />
    </svg>
  ),
  '/app/crm/reports': (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 14l4-4 3 3 5-6" />
      <rect x="2" y="2" width="16" height="16" rx="1" />
    </svg>
  ),
  '/app/crm/team': (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="3" />
      <path d="M1 18c0-3.314 2.686-6 6-6s6 2.686 6 6" />
      <path d="M13 5a3 3 0 0 1 0 6" />
      <path d="M17 18c0-2.761-1.79-5.1-4-5.8" />
    </svg>
  ),
  '/app/suppliers': (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 2h12l1 5H3L4 2z" />
      <rect x="3" y="7" width="14" height="11" rx="1" />
      <path d="M8 12h4" />
    </svg>
  ),
};

interface NavProps {
  displayName?: string;
  isOwner?: boolean;
}

export function Nav({ displayName, isOwner }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarLinks = isOwner ? [...NAV_LINKS, ...OWNER_EXTRAS] : NAV_LINKS;
  const isActive = (href: string) => pathname.startsWith(href);
  const isNewRecapActive = isActive('/app/crm/new-recap');

  const handleSignOut = async () => {
    const sb = createClient();
    await sb.auth.signOut();
    router.push('/login');
  };

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div className={styles.mobileTopBar}>
        <Link href="/app/crm/new-recap" className={styles.mobileWordmark}>
          <Image
            src="/logo.jpeg"
            alt="Pour Advice logo"
            className={styles.wordmarkLogo}
            width={28}
            height={28}
          />
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

      {/* ── Sidebar backdrop (mobile) ── */}
      {mobileOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Desktop/slide-over sidebar ── */}
      <nav className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.brand}>
          <Link href="/app/crm/new-recap" className={styles.wordmark}>
            <Image
              src="/logo.jpeg"
              alt="Pour Advice logo"
              className={styles.wordmarkLogo}
              width={28}
              height={28}
            />
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
          {sidebarLinks.map(({ href, label }) => (
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

      {/* ── Mobile bottom tab bar ── */}
      <div className={styles.bottomNav} role="navigation" aria-label="Main navigation">
        {sidebarLinks.map(({ href, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.bottomTab} ${active ? styles.bottomTabActive : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className={styles.bottomTabIcon}>{ICONS[href]}</span>
              <span className={styles.bottomTabLabel}>{label}</span>
            </Link>
          );
        })}

        {/* Center FAB — New Recap */}
        <Link
          href="/app/crm/new-recap"
          className={`${styles.bottomFab} ${isNewRecapActive ? styles.bottomFabActive : ''}`}
          aria-label="New Recap"
          onClick={(e) => {
            if (isNewRecapActive) {
              e.preventDefault();
              window.location.href = '/app/crm/new-recap';
            }
          }}
        >
          <span className={styles.bottomFabIcon} aria-hidden="true">+</span>
        </Link>
      </div>
    </>
  );
}
