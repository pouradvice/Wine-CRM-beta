// src/lib/dateUtils.ts
// Returns today's date as a local-timezone ISO date string 'YYYY-MM-DD'.
// Use this everywhere a "today" date is needed instead of
// new Date().toISOString().split('T')[0], which returns UTC and causes
// off-by-one errors for users in negative UTC offsets after ~7pm local time.

export function todayLocal(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}
