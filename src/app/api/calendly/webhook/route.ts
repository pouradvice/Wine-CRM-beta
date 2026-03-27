// src/app/api/calendly/webhook/route.ts
// Calendly webhook handler — invitee.created event.
//
// POST /api/calendly/webhook
//
// Workflow:
//   1. Verify Calendly-Webhook-Signature (HMAC-SHA256)
//   2. Extract invitee name, email, meeting time, and UTM params
//   3. Create a Lead row (source: 'tasting_request')
//   4. Fetch brand details via UTM utm_content param
//   5. Send specialist dossier email
//
// UTM convention (set when building Calendly links on the tasting page):
//   utm_source   = 'pouradvice'
//   utm_campaign = 'tasting'
//   utm_content  = '<brand_name>'   (URL-encoded)
//   team_id      = '<uuid>'         (custom Calendly question or UTM tag)
//
// Calendly passes UTM params through to the webhook payload under
// payload.tracking.utm_*  (and custom questions under
// payload.questions_and_answers).

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { createLead, getActiveBrandsWithProducts, getTeamSettings } from '@/lib/data';
import { sendDossierEmail } from '@/lib/email';

// ── Signature verification ────────────────────────────────────

function verifyCalendlySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.CALENDLY_WEBHOOK_SECRET;
  // If no secret configured, skip verification (dev/staging mode)
  if (!secret) return true;
  if (!header) return false;

  // Header format: "t=<timestamp>,v1=<signature>"
  const parts   = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const t        = parts['t'];
  const v1       = parts['v1'];
  if (!t || !v1) return false;

  const payload  = `${t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

// ── Calendly payload types (partial) ─────────────────────────

interface CalendlyPayload {
  event:   string;   // "invitee.created" | "invitee.canceled"
  payload: {
    name:   string;
    email:  string;
    uri:    string;   // invitee URI
    scheduled_event: {
      uri:        string;
      name:       string;
      start_time: string;
      end_time:   string;
    };
    tracking: {
      utm_source?:   string;
      utm_campaign?: string;
      utm_content?:  string;
      utm_medium?:   string;
    };
    questions_and_answers?: Array<{
      question: string;
      answer:   string;
    }>;
  };
}

// ── Route handler ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sigHeader = req.headers.get('Calendly-Webhook-Signature');

  if (!verifyCalendlySignature(rawBody, sigHeader)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: CalendlyPayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Only handle invitee.created
  if (body.event !== 'invitee.created') {
    return NextResponse.json({ message: 'Event ignored' }, { status: 200 });
  }

  const { payload } = body;
  const tracking   = payload.tracking ?? {};

  // Extract team_id from custom question "team_id" or UTM medium
  // Convention: the tasting page appends ?utm_medium=<team_id> to the Calendly link
  const teamId = tracking.utm_medium ?? null;
  if (!teamId) {
    console.warn('[Calendly webhook] No team_id in UTM params — cannot create lead');
    return NextResponse.json({ message: 'No team_id; skipped' }, { status: 200 });
  }

  const brandName   = tracking.utm_content ? decodeURIComponent(tracking.utm_content) : null;
  const meetingDate = payload.scheduled_event?.start_time ?? null;

  // Optional: extract company from Q&A
  const companyQA = payload.questions_and_answers?.find(
    qa => /company|organisation|organization/i.test(qa.question),
  );
  const company = companyQA?.answer ?? null;

  try {
    const sb = createServiceClient();

    // 1. Create lead
    const lead = await createLead(
      {
        team_id:            teamId,
        name:               payload.name,
        email:              payload.email,
        company,
        brand_interest:     brandName,
        source:             'tasting_request',
        meeting_date:       meetingDate,
        status:             'scheduled',
        calendly_event_uri: payload.scheduled_event?.uri ?? null,
        notes:              null,
      },
      sb,
    );

    // 2. Fetch brand details + team settings for dossier
    const [brands, settings] = await Promise.all([
      getActiveBrandsWithProducts(teamId, sb),
      getTeamSettings(teamId, sb),
    ]);

    const brand = brandName
      ? brands.find(b => b.name.toLowerCase() === brandName.toLowerCase()) ?? brands[0]
      : brands[0];

    // 3. Send dossier to specialist (only if brand found and contact email configured)
    if (brand && settings?.contact_email) {
      await sendDossierEmail({
        to:             settings.contact_email,
        inviteeName:    payload.name,
        inviteeEmail:   payload.email,
        inviteeCompany: company,
        meetingDate:    meetingDate ?? new Date().toISOString(),
        brand,
        settings,
      });
    }

    return NextResponse.json({ lead_id: lead.id }, { status: 201 });
  } catch (err) {
    console.error('[Calendly webhook] Error:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
