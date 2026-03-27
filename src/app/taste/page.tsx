// src/app/taste/page.tsx
// Public tasting page — no auth required.
// Embed in WordPress as an iframe:
//   <iframe src="https://<your-domain>/taste?team=<team_id>"
//           width="100%" height="900" style="border:none;" />
//
// Query params:
//   team   — required, Supabase team UUID

import type { Metadata } from 'next';
import { createServiceClient } from '@/lib/supabase/service';
import { getActiveBrandsWithProducts, getTeamSettings } from '@/lib/data';
import TastePageClient from './TastePageClient';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ team?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { team: teamId } = await searchParams;
  if (!teamId) return { title: 'Wine Tastings' };
  try {
    const sb       = createServiceClient();
    const settings = await getTeamSettings(teamId, sb);
    return {
      title: settings?.team_name ? `${settings.team_name} — Wine Tastings` : 'Wine Tastings',
    };
  } catch {
    return { title: 'Wine Tastings' };
  }
}

export default async function TastePage({ searchParams }: Props) {
  const { team: teamId } = await searchParams;

  if (!teamId) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: 'sans-serif', color: '#7a6a5a' }}>
        <p>No team specified. Add <code>?team=&lt;team_id&gt;</code> to the URL.</p>
      </div>
    );
  }

  let brands: Awaited<ReturnType<typeof getActiveBrandsWithProducts>> = [];
  let settings: Awaited<ReturnType<typeof getTeamSettings>> = null;

  try {
    const sb = createServiceClient();
    [brands, settings] = await Promise.all([
      getActiveBrandsWithProducts(teamId, sb),
      getTeamSettings(teamId, sb),
    ]);
  } catch (err) {
    console.error('[TastePage] Data fetch error:', err);
  }

  return (
    <TastePageClient
      brands={brands}
      settings={settings}
      teamId={teamId}
    />
  );
}
