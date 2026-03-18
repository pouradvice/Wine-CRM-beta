// src/lib/dateUtils.ts
// Date utilities for Wine CRM

/**
 * Returns today's date in the **server's** local timezone as an ISO date string
 * (YYYY-MM-DD).
 *
 * Note: in a Next.js server-component context this uses the server's timezone
 * (typically UTC on most hosting platforms). Both the plan-save route and the
 * review-page validation call this same function, so they are mutually
 * consistent — if the server is in UTC, a user crossing midnight in their own
 * timezone may see their session invalidated slightly early or late.
 * A timezone-aware solution would require sending the client's IANA timezone
 * and is deferred to a future sprint.
 */
export function todayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date string (YYYY-MM-DD) for display.
 * Returns "Never" if the date is null/undefined.
 */
export function formatDateDisplay(date: string | null | undefined): string {
  if (!date) return 'Never';
  const [year, month, day] = date.split('-');
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
