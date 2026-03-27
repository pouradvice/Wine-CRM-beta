// ============================================================
// src/lib/dossier.ts
// Wine CRM — HTML email template builders
//
// buildDossierHtml  — specialist briefing when a tasting is booked
// buildCampaignHtml — subscriber notification for a new brand
//
// Both return self-contained HTML strings (inline styles) that
// render well in Gmail, Apple Mail, and Outlook.
// ============================================================

import type { PublicBrandCard } from '@/lib/data';
import type { EmailSubscriber, TeamSettings } from '@/types';

// ── Shared tokens ─────────────────────────────────────────────

const WINE    = '#6b1f2a';
const GOLD    = '#c9973a';
const CREAM   = '#faf7f2';
const PARCH   = '#f5f0e8';
const TEXT    = '#2c1810';
const MUTED   = '#7a6a5a';

function priceLabel(cost: number | null): string {
  if (cost == null) return '';
  return `$${cost.toFixed(2)} frontline`;
}

function productRow(p: PublicBrandCard['products'][number]): string {
  const meta = [p.varietal, p.vintage, p.type].filter(Boolean).join(' · ');
  const price = priceLabel(p.frontline_cost);
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${PARCH};">
        <strong style="color:${TEXT};font-size:14px;">${p.wine_name}</strong>
        ${meta ? `<br/><span style="color:${MUTED};font-size:12px;">${meta}</span>` : ''}
        ${p.tasting_notes ? `<br/><em style="color:${MUTED};font-size:12px;">${p.tasting_notes}</em>` : ''}
        ${price ? `<br/><span style="color:${GOLD};font-size:12px;font-weight:600;">${price}</span>` : ''}
        ${p.distributor ? `<br/><span style="color:${MUTED};font-size:11px;">Dist: ${p.distributor}</span>` : ''}
        ${p.tech_sheet_url ? `<br/><a href="${p.tech_sheet_url}" style="color:${WINE};font-size:11px;">Tech Sheet ↗</a>` : ''}
      </td>
    </tr>`;
}

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:'DM Sans',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <!-- Header bar -->
          <tr>
            <td style="background:${WINE};padding:28px 32px;">
              <p style="margin:0;font-size:11px;letter-spacing:2px;color:rgba(255,255,255,0.6);text-transform:uppercase;">Pour Advice</p>
              <h1 style="margin:6px 0 0;font-size:22px;color:#fff;font-weight:700;">${'<!-- TITLE -->'}</h1>
            </td>
          </tr>
          ${content}
          <!-- Footer -->
          <tr>
            <td style="background:${PARCH};padding:20px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:${MUTED};">
                Pour Advice · Wine Sales CRM
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Dossier — specialist briefing ────────────────────────────

export function buildDossierHtml(opts: {
  inviteeName:    string;
  inviteeEmail:   string;
  inviteeCompany: string | null;
  meetingDate:    string;
  brand:          PublicBrandCard;
  settings:       TeamSettings;
}): string {
  const { inviteeName, inviteeEmail, inviteeCompany, meetingDate, brand, settings } = opts;

  const dateStr = new Date(meetingDate).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

  const productRows = brand.products.map(productRow).join('');

  const content = `
    <!-- Intro -->
    <tr>
      <td style="padding:28px 32px 0;">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${GOLD};font-weight:600;">Tasting Briefing</p>
        <h2 style="margin:0 0 16px;font-size:20px;color:${TEXT};">${brand.name}</h2>
        <table cellpadding="0" cellspacing="0" style="background:${PARCH};border-radius:6px;padding:16px;width:100%;margin-bottom:20px;">
          <tr>
            <td style="font-size:13px;color:${TEXT};">
              <strong>Guest:</strong> ${inviteeName}
              ${inviteeCompany ? ` · ${inviteeCompany}` : ''}<br/>
              <strong>Email:</strong> <a href="mailto:${inviteeEmail}" style="color:${WINE};">${inviteeEmail}</a><br/>
              <strong>Date:</strong> ${dateStr}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Brand story -->
    <tr>
      <td style="padding:0 32px 20px;">
        <h3 style="margin:0 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:${WINE};">Brand Story</h3>
        ${brand.description
          ? `<p style="margin:0;font-size:14px;color:${TEXT};line-height:1.6;">${brand.description}</p>`
          : `<p style="margin:0;font-size:14px;color:${MUTED};">No description on file.</p>`}
        <p style="margin:8px 0 0;font-size:13px;color:${MUTED};">
          ${[brand.country, brand.region].filter(Boolean).join(' · ')}
          ${brand.website ? ` · <a href="${brand.website}" style="color:${WINE};">${brand.website}</a>` : ''}
        </p>
        ${brand.supplier
          ? `<p style="margin:4px 0 0;font-size:13px;color:${MUTED};">Supplier: <strong>${brand.supplier.name}</strong></p>`
          : ''}
      </td>
    </tr>

    <!-- Products -->
    <tr>
      <td style="padding:0 32px 28px;">
        <h3 style="margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:${WINE};">Portfolio (${brand.products.length} SKU${brand.products.length !== 1 ? 's' : ''})</h3>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${productRows || `<tr><td style="color:${MUTED};font-size:13px;">No active SKUs on file.</td></tr>`}
        </table>
      </td>
    </tr>

    <!-- Key selling points -->
    <tr>
      <td style="padding:0 32px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:${PARCH};border-left:4px solid ${GOLD};padding:16px;border-radius:0 6px 6px 0;">
          <tr>
            <td style="font-size:13px;color:${TEXT};">
              <strong style="display:block;margin-bottom:8px;color:${WINE};">Key Talking Points</strong>
              <ul style="margin:0;padding-left:18px;line-height:1.8;">
                ${brand.country ? `<li>Origin: ${[brand.country, brand.region].filter(Boolean).join(', ')}</li>` : ''}
                ${brand.supplier ? `<li>Distribution partner: ${brand.supplier.name}</li>` : ''}
                <li>${brand.products.length} active SKU${brand.products.length !== 1 ? 's' : ''} in portfolio</li>
                ${brand.products.some(p => p.tech_sheet_url)
                  ? '<li>Tech sheets available (see links above)</li>'
                  : ''}
                ${brand.website ? `<li>Brand website: <a href="${brand.website}" style="color:${WINE};">${brand.website}</a></li>` : ''}
              </ul>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  return emailShell(content)
    .replace('<!-- TITLE -->', `Tasting with ${inviteeName}`);
}

// ── Campaign — subscriber notification ───────────────────────

export function buildCampaignHtml(opts: {
  subscriber:  EmailSubscriber;
  brand:       PublicBrandCard;
  settings:    TeamSettings;
  calendlyUrl: string;
}): string {
  const { subscriber, brand, settings, calendlyUrl } = opts;

  const bookingUrl = `${calendlyUrl}?utm_source=email_campaign&utm_medium=email&utm_campaign=new_brand&utm_content=${encodeURIComponent(brand.name)}`;

  const productList = brand.products
    .slice(0, 4)
    .map(p => {
      const meta = [p.type, p.varietal, p.vintage].filter(Boolean).join(', ');
      return `<li style="margin-bottom:6px;font-size:14px;color:${TEXT};">${p.wine_name}${meta ? ` <span style="color:${MUTED};">(${meta})</span>` : ''}</li>`;
    })
    .join('');

  const moreCount = brand.products.length - 4;

  const content = `
    <!-- Intro -->
    <tr>
      <td style="padding:28px 32px 16px;">
        <p style="margin:0 0 6px;font-size:13px;color:${MUTED};">Hello${subscriber.name ? ` ${subscriber.name.split(' ')[0]}` : ''},</p>
        <h2 style="margin:0 0 12px;font-size:20px;color:${TEXT};">We're excited to introduce <span style="color:${WINE};">${brand.name}</span></h2>
        <p style="margin:0;font-size:14px;color:${TEXT};line-height:1.6;">
          ${brand.description ?? `${brand.name} is now available for private tastings. Book your appointment with a ${settings.team_name ?? 'Pour Advice'} specialist.`}
        </p>
        ${brand.country || brand.region
          ? `<p style="margin:10px 0 0;font-size:13px;color:${MUTED};">${[brand.country, brand.region].filter(Boolean).join(' · ')}</p>`
          : ''}
      </td>
    </tr>

    <!-- Products preview -->
    ${brand.products.length > 0 ? `
    <tr>
      <td style="padding:0 32px 20px;">
        <h3 style="margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:${WINE};">Featured Wines</h3>
        <ul style="margin:0;padding-left:18px;line-height:1.7;">
          ${productList}
          ${moreCount > 0 ? `<li style="font-size:13px;color:${MUTED};">+ ${moreCount} more SKU${moreCount > 1 ? 's' : ''}</li>` : ''}
        </ul>
      </td>
    </tr>` : ''}

    <!-- CTA -->
    <tr>
      <td style="padding:0 32px 32px;text-align:center;">
        <a href="${bookingUrl}"
           style="display:inline-block;background:${WINE};color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:600;letter-spacing:0.5px;">
          Book a Private Tasting →
        </a>
        <p style="margin:16px 0 0;font-size:12px;color:${MUTED};">
          Appointments are complimentary and typically 30–45 minutes.
        </p>
      </td>
    </tr>

    <!-- Unsubscribe note -->
    <tr>
      <td style="padding:0 32px 20px;text-align:center;">
        <p style="margin:0;font-size:11px;color:${MUTED};">
          You're receiving this because you opted in to tasting announcements from ${settings.team_name ?? 'Pour Advice'}.
        </p>
      </td>
    </tr>
  `;

  return emailShell(content)
    .replace('<!-- TITLE -->', `New Arrival: ${brand.name}`);
}
