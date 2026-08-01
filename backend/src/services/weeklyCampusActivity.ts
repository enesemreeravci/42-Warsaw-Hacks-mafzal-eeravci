import type { RawCursusUser, RawLocation, RawUser } from '../models/types.js';
import { pickDisplayName, pickImageUrl } from './normalize.js';

/** "Weekly Campus Activity" reporting window, in days. */
export const WEEKLY_ACTIVITY_WINDOW_DAYS = 7;
export const WEEKLY_ACTIVITY_TIMEZONE = 'Europe/Warsaw';
const DEFAULT_TOP_N = 10;

export interface ReportingPeriod {
  start: Date;
  end: Date;
}

/** Public, normalized shape returned to the frontend - deliberately excludes raw personal
 * fields (email, phone, anonymize_date, etc.) that the 42 API's user object may carry. */
export interface WeeklyActivityStudent {
  userId: number;
  login: string;
  displayName: string;
  imageUrl: string | null;
  totalMinutes: number;
  totalHours: number;
  sessionCount: number;
  averageSessionMinutes: number;
  uniqueHostCount: number;
}

/** Internal-only aggregation shape: carries the raw millisecond total so ranking/tie-breaking
 * can use full precision instead of the minute-rounded value exposed to callers. Stripped down
 * to WeeklyActivityStudent (via toPublicStudent()) before ever leaving this module. */
interface WeeklyActivityStudentInternal extends WeeklyActivityStudent {
  totalMs: number;
}

export interface WeeklyCampusActivitySummary {
  validStudents: number;
  locationRecordsProcessed: number;
  uniqueActiveStudents: number;
  totalCampusMinutes: number;
  totalSessions: number;
}

export interface WeeklyCampusActivityMeta {
  campusId: number;
  cursusId: number;
  source: '42-api' | 'cache';
  lastUpdated: string;
  warning?: string;
  /** Endpoint B (`/v2/campus/:id/locations`) is filtered by `begin_at`, so a session that began
   * before the reporting window but continued into it is never returned by the 42 API - it's
   * absent from these figures entirely rather than partially counted. Both rankings therefore
   * slightly undercount students who were already on campus when the window opened. */
  limitation: string;
}

export interface WeeklyCampusActivityResponse {
  period: { start: string; end: string; timeZone: typeof WEEKLY_ACTIVITY_TIMEZONE };
  mostCampusTime: WeeklyActivityStudent[];
  mostSessionsStarted: WeeklyActivityStudent[];
  summary: WeeklyCampusActivitySummary;
  meta: WeeklyCampusActivityMeta;
}

/** Dynamically computes the trailing WEEKLY_ACTIVITY_WINDOW_DAYS-day window ending at `now` -
 * never hardcoded dates. The underlying instants are timezone-agnostic (every JS Date is UTC
 * internally); Europe/Warsaw only matters when *formatting* these for display, not here. */
export function getLastSevenDaysRange(now: Date = new Date()): ReportingPeriod {
  const end = now;
  const start = new Date(end.getTime() - WEEKLY_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Collapses cursus_users records down to the Set of valid Warsaw-main-cursus user IDs. A
 * `Set` inherently deduplicates, so repeated records for the same user (e.g. a duplicate page
 * row) collapse to one entry with no extra bookkeeping. */
export function buildValidStudentIds(cursusUsers: RawCursusUser[]): Set<number> {
  const ids = new Set<number>();
  for (const record of cursusUsers) {
    const id = record.user?.id;
    if (typeof id === 'number') ids.add(id);
  }
  return ids;
}

export interface NormalizedLocationUser {
  id: number;
  login: string;
  displayName: string;
  imageUrl: string | null;
}

/** Extracts and normalizes only the fields worth keeping from a location record's embedded
 * user - never forwards email/phone/anonymize_date/erasure fields even though the raw 42 API
 * object may carry them. Returns null for a missing/malformed user instead of throwing. */
export function normalizeLocationUser(user: RawUser | undefined): NormalizedLocationUser | null {
  if (!user || typeof user.id !== 'number' || !user.login) return null;
  return { id: user.id, login: user.login, displayName: pickDisplayName(user), imageUrl: pickImageUrl(user) };
}

/**
 * Clamps one session to the reporting window and returns the overlapping duration in
 * milliseconds - never negative, never throws on a malformed timestamp.
 *
 * effectiveStart = max(begin_at, rangeStart); effectiveEnd = min(end_at ?? now, rangeEnd).
 */
export function calculateSessionOverlapMs(
  beginAt: string | null | undefined,
  endAt: string | null | undefined,
  rangeStart: Date,
  rangeEnd: Date,
  now: Date,
): number {
  if (!beginAt) return 0;
  const begin = new Date(beginAt);
  if (Number.isNaN(begin.getTime())) return 0;

  const endSource = endAt ? new Date(endAt) : now;
  const end = Number.isNaN(endSource.getTime()) ? now : endSource;

  const effectiveStart = Math.max(begin.getTime(), rangeStart.getTime());
  const effectiveEnd = Math.min(end.getTime(), rangeEnd.getTime());

  return Math.max(0, effectiveEnd - effectiveStart);
}

export function formatMinutesAsHoursAndMinutes(totalMinutes: number): string {
  const safe = Number.isFinite(totalMinutes) ? Math.max(0, Math.round(totalMinutes)) : 0;
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}h ${minutes}m`;
}

interface Accumulator {
  user: NormalizedLocationUser;
  totalMs: number;
  sessionCount: number;
  hosts: Set<string>;
}

export interface AggregationResult {
  students: WeeklyActivityStudentInternal[];
  locationRecordsProcessed: number;
  totalCampusMinutes: number;
  totalSessions: number;
}

/**
 * Groups location records by user and computes each student's weekly totals. Every record is
 * validated independently - one malformed record (missing id/begin_at/user) is skipped, not
 * thrown on, so it can never take the whole feature down.
 */
export function aggregateWeeklyActivity(locations: RawLocation[], period: ReportingPeriod, now: Date): AggregationResult {
  const byUser = new Map<number, Accumulator>();
  let processed = 0;

  for (const location of locations) {
    if (typeof location?.id !== 'number' || !location.begin_at) continue;
    const user = normalizeLocationUser(location.user);
    if (!user) continue;

    const overlapMs = calculateSessionOverlapMs(location.begin_at, location.end_at, period.start, period.end, now);
    processed += 1;

    const host = typeof location.host === 'string' && location.host.length > 0 ? location.host : null;
    const existing = byUser.get(user.id);
    if (existing) {
      existing.totalMs += overlapMs;
      existing.sessionCount += 1;
      if (host) existing.hosts.add(host);
    } else {
      const hosts = new Set<string>();
      if (host) hosts.add(host);
      byUser.set(user.id, { user, totalMs: overlapMs, sessionCount: 1, hosts });
    }
  }

  const students: WeeklyActivityStudentInternal[] = Array.from(byUser.values()).map((acc) => {
    const totalMinutes = Math.round(acc.totalMs / 60_000);
    return {
      userId: acc.user.id,
      login: acc.user.login,
      displayName: acc.user.displayName,
      imageUrl: acc.user.imageUrl,
      totalMs: acc.totalMs,
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      sessionCount: acc.sessionCount,
      averageSessionMinutes: acc.sessionCount > 0 ? Math.round(totalMinutes / acc.sessionCount) : 0,
      uniqueHostCount: acc.hosts.size,
    };
  });

  const totalCampusMinutes = students.reduce((sum, s) => sum + s.totalMinutes, 0);
  const totalSessions = students.reduce((sum, s) => sum + s.sessionCount, 0);

  return { students, locationRecordsProcessed: processed, totalCampusMinutes, totalSessions };
}

function toPublicStudent(student: WeeklyActivityStudentInternal): WeeklyActivityStudent {
  const { userId, login, displayName, imageUrl, totalMinutes, totalHours, sessionCount, averageSessionMinutes, uniqueHostCount } = student;
  return { userId, login, displayName, imageUrl, totalMinutes, totalHours, sessionCount, averageSessionMinutes, uniqueHostCount };
}

/** Most Campus Time: total time desc, then session count desc, then login asc (deterministic). */
export function rankByCampusTime(students: WeeklyActivityStudentInternal[], limit = DEFAULT_TOP_N): WeeklyActivityStudentInternal[] {
  return [...students]
    .sort((a, b) => b.totalMs - a.totalMs || b.sessionCount - a.sessionCount || a.login.localeCompare(b.login))
    .slice(0, limit);
}

/** Most Sessions Started: session count desc, then total time desc, then login asc (deterministic). */
export function rankBySessionCount(students: WeeklyActivityStudentInternal[], limit = DEFAULT_TOP_N): WeeklyActivityStudentInternal[] {
  return [...students]
    .sort((a, b) => b.sessionCount - a.sessionCount || b.totalMs - a.totalMs || a.login.localeCompare(b.login))
    .slice(0, limit);
}

export interface BuildWeeklyCampusActivityParams {
  cursusUsers: RawCursusUser[];
  /** Already paginated (and ideally deduplicated) location records for the reporting window. */
  locations: RawLocation[];
  campusId: number;
  cursusId: number;
  period: ReportingPeriod;
  now: Date;
  limit?: number;
}

/**
 * Pure orchestrator: filters raw cursus_users/locations down to valid Warsaw-main-cursus
 * sessions, aggregates per student, and builds both Top-N rankings. Takes already-fetched raw
 * arrays (no network/caching here) so it can be unit tested without mocking the 42 API - fetching
 * and caching live in DataService.getWeeklyCampusActivity(), which reuses Ft42ApiClient.paginate()
 * for pagination and the shared roster cache for cursus_users (see dataService.ts).
 */
export function buildWeeklyCampusActivity(params: BuildWeeklyCampusActivityParams): WeeklyCampusActivityResponse {
  const { cursusUsers, locations, campusId, cursusId, period, now, limit = DEFAULT_TOP_N } = params;

  const validStudentIds = buildValidStudentIds(cursusUsers);

  // Mandatory filtering: campus 67 only (defense-in-depth - the endpoint is already
  // campus-scoped by URL, but a mismatched/missing campus_id is rejected rather than trusted)
  // and Warsaw-main-cursus students only (excludes Pisciners/staff/visitors/other campuses).
  const validLocations = locations.filter((location) => {
    if (typeof location?.id !== 'number' || !location.begin_at) return false;
    if (location.campus_id !== undefined && location.campus_id !== campusId) return false;
    const userId = location.user?.id;
    return typeof userId === 'number' && validStudentIds.has(userId);
  });

  const { students, locationRecordsProcessed, totalCampusMinutes, totalSessions } = aggregateWeeklyActivity(validLocations, period, now);

  return {
    period: { start: period.start.toISOString(), end: period.end.toISOString(), timeZone: WEEKLY_ACTIVITY_TIMEZONE },
    mostCampusTime: rankByCampusTime(students, limit).map(toPublicStudent),
    mostSessionsStarted: rankBySessionCount(students, limit).map(toPublicStudent),
    summary: {
      validStudents: validStudentIds.size,
      locationRecordsProcessed,
      uniqueActiveStudents: students.length,
      totalCampusMinutes,
      totalSessions,
    },
    meta: {
      campusId,
      cursusId,
      source: '42-api',
      lastUpdated: now.toISOString(),
      limitation:
        'Sessions are matched by begin_at falling within this window; a session already in progress when the window opened is not returned by the 42 API and is therefore not counted.',
    },
  };
}
