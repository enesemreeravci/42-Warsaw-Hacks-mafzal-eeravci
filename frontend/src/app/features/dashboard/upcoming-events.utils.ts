import { WARSAW_TIME_ZONE } from '../../shared/utils/warsaw-time.util';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Formats an ISO timestamp as a short Warsaw-local date, e.g. "Sat, 01 Aug". */
export function formatWarsawDate(iso: string | null | undefined): string {
  if (!iso) return 'Unavailable';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  return new Intl.DateTimeFormat('en-GB', { timeZone: WARSAW_TIME_ZONE, weekday: 'short', day: '2-digit', month: 'short' }).format(date);
}

/** Warsaw-local calendar-day key (YYYY-MM-DD) - used to compare "is this the same day" across
 * timezones correctly, rather than comparing raw UTC instants. */
function warsawDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: WARSAW_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** True when the event's start falls on the same Warsaw-local calendar day as `now`. */
export function isEventToday(beginIso: string, now: Date): boolean {
  const begin = new Date(beginIso);
  if (Number.isNaN(begin.getTime())) return false;
  return warsawDayKey(begin) === warsawDayKey(now);
}

/** True when `now` falls between the event's begin_at and end_at (inclusive). */
export function isEventLiveNow(beginIso: string, endIso: string, now: Date): boolean {
  const begin = new Date(beginIso).getTime();
  const end = new Date(endIso).getTime();
  const t = now.getTime();
  if (Number.isNaN(begin) || Number.isNaN(end)) return false;
  return t >= begin && t <= end;
}

/** "Starts in 2 days" / "Starts in 3 hours" / "Starts in 12 minutes" / "Starting now" for an
 * event whose start has already arrived (but isn't necessarily over - see isEventLiveNow). */
export function formatCountdown(beginIso: string, now: Date): string {
  const begin = new Date(beginIso);
  if (Number.isNaN(begin.getTime())) return 'Unavailable';

  const diffMs = begin.getTime() - now.getTime();
  if (diffMs <= 0) return 'Starting now';

  if (diffMs < HOUR_MS) {
    const minutes = Math.max(1, Math.round(diffMs / MINUTE_MS));
    return `Starts in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  if (diffMs < DAY_MS) {
    const hours = Math.round(diffMs / HOUR_MS);
    return `Starts in ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.round(diffMs / DAY_MS);
  return `Starts in ${days} day${days === 1 ? '' : 's'}`;
}
