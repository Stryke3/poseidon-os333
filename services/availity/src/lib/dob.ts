/** Store API YYYY-MM-DD as UTC midnight for Prisma `DateTime` / Postgres `timestamp`. */
export function parseYmdToUtcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Format a UTC-stored calendar date for display (YYYY-MM-DD). */
export function formatDateToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
