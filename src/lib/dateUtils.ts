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
