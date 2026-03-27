// ============================================================
// src/lib/email.ts
// Wine CRM — Email sending via Resend
//
// Used by:
//  • Calendly webhook → dossier briefing to specialist
//  • New-brand campaign → opt-in subscriber notifications
//
// Requires env: RESEND_API_KEY, RESEND_FROM_ADDRESS
// ============================================================

import { Resend } from 'resend';
import type { PublicBrandCard } from '@/lib/data';
import type { EmailSubscriber, TeamSettings } from '@/types';
import { buildDossierHtml, buildCampaignHtml } from '@/lib/dossier';

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  return new Resend(apiKey);
}

async function sendEmail(opts: {
  from:     string;
  to:       string | string[];
  subject:  string;
  html:     string;
  replyTo?: string;
}): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from:     opts.from,
    to:       opts.to,
    subject:  opts.subject,
    html:     opts.html,
    replyTo:  opts.replyTo,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

const FROM = process.env.RESEND_FROM_ADDRESS ?? 'tastings@pouradvice.com';

// ── Dossier briefing ──────────────────────────────────────────

/** Sends the specialist dossier email when a tasting is booked via Calendly. */
export async function sendDossierEmail(opts: {
  to:          string;
  inviteeName: string;
  inviteeEmail: string;
  inviteeCompany: string | null;
  meetingDate: string;
  brand:       PublicBrandCard;
  settings:    TeamSettings;
}): Promise<void> {
  const { to, inviteeName, inviteeEmail, inviteeCompany, meetingDate, brand, settings } = opts;

  const html = buildDossierHtml({ inviteeName, inviteeEmail, inviteeCompany, meetingDate, brand, settings });

  await sendEmail({
    from:     FROM,
    to,
    subject:  `Tasting Briefing: ${inviteeName} — ${brand.name} · ${new Date(meetingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    html,
    replyTo: inviteeEmail,
  });
}

// ── Campaign email ─────────────────────────────────────────────

/** Sends a new-brand announcement to a single subscriber. */
export async function sendCampaignEmail(opts: {
  subscriber:  EmailSubscriber;
  brand:       PublicBrandCard;
  settings:    TeamSettings;
  calendlyUrl: string;
}): Promise<void> {
  const { subscriber, brand, settings, calendlyUrl } = opts;

  const html = buildCampaignHtml({ subscriber, brand, settings, calendlyUrl });

  await sendEmail({
    from:    FROM,
    to:      subscriber.email,
    subject: `New Arrival: ${brand.name} — Book a Private Tasting`,
    html,
  });
}
