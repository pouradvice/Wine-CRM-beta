'use client';
// src/components/layout/Nav.tsx

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './Nav.module.css';

const NAV_LINKS = [
  { href: '/app/crm/clients',            label: 'Accounts' },
  { href: '/app/crm/products',           label: 'Products' },
  { href: '/app/crm/history',            label: 'History' },
  { href: '/app/crm/follow-ups',         label: 'Follow-Ups' },
  { href: '/app/crm/reports',            label: 'Reports' },
  { href: '/app/crm/tasting-requests',   label: 'Tasting Requests' },
];

const OWNER_EXTRAS = [
  { href: '/app/crm/team',      label: 'Team' },
  { href: '/app/crm/suppliers', label: 'Suppliers' },
];

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

    </>
  );
}
