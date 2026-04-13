'use client';
// src/app/(auth)/login/page.tsx

import { Suspense, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './login.module.css';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const sb = createClient();
    const { data: authData, error: authError } = await sb.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      setError(authError?.message ?? 'Invalid email or password.');
      setLoading(false);
      return;
    }

    // If the middleware set a ?redirect param (e.g. an unauthenticated portal
    // user was redirected to /login), honour it first.
    const redirectParam = searchParams.get('redirect');
    if (redirectParam && (redirectParam.startsWith('/supplier/') || redirectParam.startsWith('/distributor/'))) {
      router.push(redirectParam);
      return;
    }

    // Determine user type and redirect to the appropriate landing page.
    // Check in order: broker team → supplier portal → distributor portal.

    const userId = authData.user.id;

    // 1. Broker CRM user
    const { data: teamRow } = await sb
      .from('team_members')
      .select('team_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (teamRow) {
      router.push('/app/crm/clients');
      return;
    }

    // 2. Supplier portal user
    const { data: supplierRow } = await sb
      .from('supplier_users')
      .select('supplier_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (supplierRow) {
      router.push(`/supplier/${supplierRow.supplier_id}`);
      return;
    }

    // 3. Distributor portal user
    const { data: distributorRow } = await sb
      .from('distributor_users')
      .select('distributor_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (distributorRow) {
      router.push(`/distributor/${distributorRow.distributor_id}`);
      return;
    }

    // No mapping found — account exists in auth but is not linked to anything.
    setError('Your account is not linked to any team or portal. Contact support.');
    setLoading(false);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Image
            src="/logo.jpeg"
            alt="Pour Advice logo"
            width={80}
            height={80}
            className={styles.logo}
            priority
          />
        </div>
        <h1 className={styles.wordmark}>Pour Advice</h1>
        <p className={styles.tagline}>Wine sales relationship management</p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>
              Email address
            </label>
            <input
              id="email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading && <span className={styles.spinner} aria-hidden="true" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
