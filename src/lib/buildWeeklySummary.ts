// src/lib/buildWeeklySummary.ts
// Builds a deterministic, data-driven weekly summary string from dashboard data.

import type { ProductPerformance, TopAccount, InactiveAccount, PipelineHealth } from '@/types';

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function buildWeeklySummary(
  visitsThisMonth: number,
  conversionRatePct: number | null,
  topSkus: ProductPerformance[],
  topAccounts: TopAccount[],
  inactiveAccounts: InactiveAccount[],
  pipelineHealth: PipelineHealth[],
): string {
  const lines: string[] = [];

  // KPI headline
  const conversionSuffix = conversionRatePct != null
    ? ` with a ${conversionRatePct}% conversion rate.`
    : '.';
  lines.push(
    `This month: ${visitsThisMonth} ${pluralize(visitsThisMonth, 'visit')}${conversionSuffix}`,
  );

  // Top product
  if (topSkus.length > 0) {
    const best = topSkus[0];
    const details: string[] = [];
    if (best.conversion_rate_pct != null) details.push(`${best.conversion_rate_pct}% conversion`);
    if (best.orders_placed > 0) details.push(`${best.orders_placed} ${pluralize(best.orders_placed, 'order')} placed`);
    const detailSuffix = details.length > 0 ? ` (${details.join(', ')})` : '';
    lines.push(`Top product: ${best.wine_name}${detailSuffix}.`);
  }

  // Top account
  if (topAccounts.length > 0) {
    const top = topAccounts[0];
    const details: string[] = [`${top.total_visits} ${pluralize(top.total_visits, 'visit')}`];
    if (top.orders_placed > 0) details.push(`${top.orders_placed} ${pluralize(top.orders_placed, 'order')}`);
    lines.push(`Most visited account: ${top.account_name} (${details.join(', ')}).`);
  }

  // Overdue / inactive account warning
  const overdueCount = inactiveAccounts.filter((a) => a.days_inactive >= 60).length;
  if (overdueCount > 0) {
    const verb = overdueCount === 1 ? 'has' : 'have';
    lines.push(`⚠ ${overdueCount} ${pluralize(overdueCount, 'account')} ${verb} had no visit in 60+ days.`);
  }

  // Pipeline breakdown
  const totalOpen = pipelineHealth.reduce((s, p) => s + p.count, 0);
  if (totalOpen > 0) {
    const breakdown = pipelineHealth
      .filter((p) => p.count > 0)
      .map((p) => `${p.outcome}: ${p.count}`)
      .join(', ');
    lines.push(`Pipeline: ${totalOpen} open ${pluralize(totalOpen, 'follow-up')} — ${breakdown}.`);
  }

  return lines.join(' ');
}
