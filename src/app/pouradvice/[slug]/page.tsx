import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { StorefrontClient } from '@/components/storefront/StorefrontClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function PourAdviceStorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = createServiceClient();

  const { data: page, error } = await sb
    .from('portfolio_pages')
    .select('team_id, calendly_url, is_active')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !page || !page.is_active) {
    notFound();
  }

  return (
    <main className={styles.page}>
      <StorefrontClient
        slug={slug}
        teamId={page.team_id}
        calendlyUrl={page.calendly_url}
      />
    </main>
  );
}
