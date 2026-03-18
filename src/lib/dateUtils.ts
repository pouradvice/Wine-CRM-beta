// src/lib/dateUtils.ts

/**
 * Returns today's date as a YYYY-MM-DD string in the browser/server local
 * timezone, avoiding the UTC-offset bug in new Date().toISOString().split('T')[0].
 */
export function todayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formats a YYYY-MM-DD date string for display (e.g. "Mar 15" or "Mar 15, 2024").
 * Returns "Never" for null/undefined.
 * Appends the year only when it differs from the current year.
 */
export function formatDateDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  // Append T00:00:00 to parse as local midnight, avoiding UTC-offset day shift.
  const d = new Date(dateStr + 'T00:00:00');
  const currentYear = new Date().getFullYear();
  if (d.getFullYear() === currentYear) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
