/** The dashboard's fixed reporting/display timezone - the campus is in Warsaw, so a TV mounted
 * there should always show Warsaw wall-clock time regardless of the viewer's/server's own
 * timezone. Shared by every feature that formats an absolute timestamp for display. */
export const WARSAW_TIME_ZONE = 'Europe/Warsaw';

/** Formats an ISO timestamp as "HH:mm" in Europe/Warsaw. */
export function formatWarsawTime(iso: string | null | undefined): string {
  if (!iso) return 'Unavailable';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  return new Intl.DateTimeFormat('en-GB', { timeZone: WARSAW_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(date);
}
