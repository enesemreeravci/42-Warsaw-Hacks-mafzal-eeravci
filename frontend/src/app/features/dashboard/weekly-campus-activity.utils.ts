import { WARSAW_TIME_ZONE } from '../../shared/utils/warsaw-time.util';

export { formatWarsawTime } from '../../shared/utils/warsaw-time.util';

/** Mirrors the backend's formatMinutesAsHoursAndMinutes() (weeklyCampusActivity.ts) - kept as a
 * separate copy since frontend/backend are separate runtimes/packages, same as every other DTO
 * shape in this app (see core/models/api.models.ts vs backend/src/models/types.ts). */
export function formatMinutesAsHoursAndMinutes(totalMinutes: number): string {
  const safe = Number.isFinite(totalMinutes) ? Math.max(0, Math.round(totalMinutes)) : 0;
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}h ${minutes}m`;
}

/** Formats a reporting period's start/end as a short Warsaw-local date range, e.g. "24 Jul - 31 Jul". */
export function formatWarsawDateRange(startIso: string | null | undefined, endIso: string | null | undefined): string {
  const start = startIso ? new Date(startIso) : null;
  const end = endIso ? new Date(endIso) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Unavailable';

  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: WARSAW_TIME_ZONE, day: '2-digit', month: 'short' });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}
