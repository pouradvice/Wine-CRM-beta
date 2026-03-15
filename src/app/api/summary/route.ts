// src/app/api/summary/route.ts
// Generates a weekly AI summary using Anthropic claude-sonnet-4-20250514.
// ANTHROPIC_API_KEY must be set in the server environment.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  // Auth guard — only authenticated users can generate summaries.
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Anthropic API key not configured on server.' },
      { status: 500 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { stats, topSkus, topAccounts } = body as {
    stats?: Record<string, unknown>;
    topSkus?: unknown[];
    topAccounts?: unknown[];
  };

  const prompt = buildPrompt(stats, topSkus, topAccounts);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Anthropic API error:', response.status, errBody);
      return NextResponse.json(
        { error: 'Failed to generate summary. Please try again.' },
        { status: 502 },
      );
    }

    const data = await response.json();
    const summary: string =
      data?.content?.[0]?.text ?? 'No summary returned.';

    return NextResponse.json({ summary });
  } catch (err) {
    console.error('Summary generation error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 },
    );
  }
}

function buildPrompt(
  stats?: Record<string, unknown>,
  topSkus?: unknown[],
  topAccounts?: unknown[],
): string {
  const lines: string[] = [
    'You are a wine sales CRM assistant. Generate a concise, professional weekly summary (3–5 sentences) for a wine sales team manager based on the following data.',
    '',
    '## KPI Stats',
  ];

  if (stats) {
    for (const [key, value] of Object.entries(stats)) {
      lines.push(`- ${key.replace(/_/g, ' ')}: ${value}`);
    }
  }

  if (topSkus && Array.isArray(topSkus) && topSkus.length > 0) {
    lines.push('', '## Top Products This Period');
    for (const sku of topSkus.slice(0, 5)) {
      const s = sku as Record<string, unknown>;
      lines.push(`- ${s.wine_name} (SKU: ${s.sku_number}): shown ${s.times_shown}x, ${s.orders_placed} orders, ${s.conversion_rate_pct ?? 0}% conversion`);
    }
  }

  if (topAccounts && Array.isArray(topAccounts) && topAccounts.length > 0) {
    lines.push('', '## Top Accounts');
    for (const account of topAccounts.slice(0, 5)) {
      const a = account as Record<string, unknown>;
      lines.push(`- ${a.client_name}: ${a.visit_count} visits, last visit ${a.last_visit}`);
    }
  }

  lines.push('', 'Please provide a concise, actionable weekly summary highlighting key wins, concerns (e.g. overdue follow-ups), and brief recommendations. Be specific and data-driven. Avoid generic filler.');

  return lines.join('\n');
}
