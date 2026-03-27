// src/app/api/leads/campaign/route.ts
// Internal — triggers an email campaign to all active subscribers
// when a new brand is activated.
//
// POST /api/leads/campaign
// Headers: Authorization: Bearer <CAMPAIGN_SECRET>
// Body: { team_id: string, brand_id: string }
//
// Designed to be called from the internal CRM (ProductsClient / brands)
// when is_active is toggled to TRUE for a new brand.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getActiveBrandsWithProducts, getEmailSubscribers, getTeamSettings } from '@/lib/data';
import { sendCampaignEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  // Simple bearer token guard (internal use only)
  const authHeader = req.headers.get('Authorization') ?? '';
  const secret     = process.env.CAMPAIGN_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { team_id?: string; brand_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { team_id, brand_id } = body;
  if (!team_id || !brand_id) {
    return NextResponse.json({ error: 'team_id and brand_id required' }, { status: 400 });
  }

  try {
    const sb = createServiceClient();

    const [brands, subscribers, settings] = await Promise.all([
      getActiveBrandsWithProducts(team_id, sb),
      getEmailSubscribers(team_id, sb),
      getTeamSettings(team_id, sb),
    ]);

    const brand = brands.find(b => b.id === brand_id);
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found or not active' }, { status: 404 });
    }

    if (!settings?.calendly_url) {
      return NextResponse.json({ error: 'No calendly_url configured for this team' }, { status: 422 });
    }

    // Send in series to avoid rate limits; for large lists use a queue
    let sent    = 0;
    let errored = 0;

    for (const subscriber of subscribers) {
      try {
        await sendCampaignEmail({
          subscriber,
          brand,
          settings,
          calendlyUrl: settings.calendly_url,
        });
        sent++;
      } catch (emailErr) {
        console.error(`[campaign] Failed to email ${subscriber.email}:`, emailErr);
        errored++;
      }
    }

    return NextResponse.json({ sent, errored, total: subscribers.length }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
