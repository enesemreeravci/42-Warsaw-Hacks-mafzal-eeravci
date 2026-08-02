import type { RawLocation, StudentSummary } from '../models/types.js';
import { normalizeLocationUser, type ReportingPeriod } from './weeklyCampusActivity.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReturningStudentCoalitionRef {
  name: string;
  color: string | null;
}

export interface ReturningStudentEntry {
  userId: number;
  login: string;
  displayName: string;
  imageUrl: string | null;
  level: number;
  coalition: ReturningStudentCoalitionRef | null;
  returnedAt: string;
  previousVisitAt: string;
  inactiveDays: number;
  currentlyOnline: boolean;
  host: string | null;
}

export interface ReturningStudentsResponse {
  period: { start: string; end: string };
  inactivityThresholdDays: number;
  totalReturningStudents: number;
  students: ReturningStudentEntry[];
  meta: {
    campusId: number;
    cursusId: number;
    source: '42-api' | 'cache';
    lastUpdated: string;
    limitation: string;
  };
}

export type ReturningSortOption = 'recent' | 'longestAbsence' | 'level' | 'login';

export interface BuildReturningStudentsParams {
  /** A lookback window meaningfully longer than the largest supported threshold (see
   * RETURNING_STUDENTS_LOOKBACK_DAYS in dataService.ts) - a student whose actual previous visit
   * falls outside this window is excluded rather than guessed at (see meta.limitation). */
  locations: RawLocation[];
  validStudentIds: Set<number>;
  studentsById: Map<number, StudentSummary>;
  coalitionByUserId: Map<number, ReturningStudentCoalitionRef>;
  activeNowUserIds: Set<number>;
  period: ReportingPeriod;
  thresholdDays: number;
  sort: ReturningSortOption;
  campusId: number;
  cursusId: number;
  now: Date;
  source: '42-api' | 'cache';
}

/**
 * Pure orchestrator. For each roster student, finds the latest session that began inside
 * `period` (the "return" candidate) and the session immediately before it in their full session
 * history; if the gap between them meets `thresholdDays`, they're a returning student. A
 * student with no prior session in the fetched history (either genuinely new, or their real gap
 * exceeds the lookback window) is never classified either way - never fabricated.
 */
export function buildReturningStudents(params: BuildReturningStudentsParams): ReturningStudentsResponse {
  const {
    locations,
    validStudentIds,
    studentsById,
    coalitionByUserId,
    activeNowUserIds,
    period,
    thresholdDays,
    sort,
    campusId,
    cursusId,
    now,
    source,
  } = params;

  const sessionsByUser = new Map<number, RawLocation[]>();
  for (const location of locations) {
    if (typeof location?.id !== 'number' || !location.begin_at) continue;
    const user = normalizeLocationUser(location.user);
    if (!user || !validStudentIds.has(user.id)) continue;
    const list = sessionsByUser.get(user.id);
    if (list) list.push(location);
    else sessionsByUser.set(user.id, [location]);
  }

  const thresholdMs = thresholdDays * DAY_MS;
  const entries: ReturningStudentEntry[] = [];

  for (const [userId, sessions] of sessionsByUser) {
    const sorted = [...sessions].sort((a, b) => new Date(a.begin_at).getTime() - new Date(b.begin_at).getTime());

    let returnIndex = -1;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const beginMs = new Date(sorted[i]!.begin_at).getTime();
      if (beginMs >= period.start.getTime() && beginMs <= period.end.getTime()) {
        returnIndex = i;
        break;
      }
    }
    // No session in-period (nothing to classify), or the in-period session is the very first
    // one seen - no prior session in our fetch window to measure a gap against.
    if (returnIndex <= 0) continue;

    const returnSession = sorted[returnIndex]!;
    const previousSession = sorted[returnIndex - 1]!;
    if (!previousSession.end_at) continue; // unreliable timestamp - excluded, not guessed at

    const gapMs = new Date(returnSession.begin_at).getTime() - new Date(previousSession.end_at).getTime();
    if (gapMs < thresholdMs) continue;

    const summary = studentsById.get(userId);
    if (!summary) continue;

    const host = typeof returnSession.host === 'string' && returnSession.host.length > 0 ? returnSession.host : null;

    entries.push({
      userId,
      login: summary.login,
      displayName: summary.displayName,
      imageUrl: summary.imageUrl,
      level: summary.level,
      coalition: coalitionByUserId.get(userId) ?? null,
      returnedAt: returnSession.begin_at,
      previousVisitAt: previousSession.end_at,
      inactiveDays: Math.floor(gapMs / DAY_MS),
      currentlyOnline: activeNowUserIds.has(userId),
      host: activeNowUserIds.has(userId) ? host : null,
    });
  }

  const sortedEntries = sortReturningStudents(entries, sort);

  return {
    period: { start: period.start.toISOString(), end: period.end.toISOString() },
    inactivityThresholdDays: thresholdDays,
    totalReturningStudents: sortedEntries.length,
    students: sortedEntries,
    meta: {
      campusId,
      cursusId,
      source,
      lastUpdated: now.toISOString(),
      limitation:
        'Only sessions within the fetched lookback window are considered. A student whose actual previous visit falls further back than that window cannot be confidently classified and is excluded rather than guessed at.',
    },
  };
}

function sortReturningStudents(entries: ReturningStudentEntry[], sort: ReturningSortOption): ReturningStudentEntry[] {
  const copy = [...entries];
  switch (sort) {
    case 'longestAbsence':
      return copy.sort((a, b) => b.inactiveDays - a.inactiveDays || a.login.localeCompare(b.login));
    case 'level':
      return copy.sort((a, b) => b.level - a.level || a.login.localeCompare(b.login));
    case 'login':
      return copy.sort((a, b) => a.login.localeCompare(b.login));
    case 'recent':
    default:
      return copy.sort(
        (a, b) => new Date(b.returnedAt).getTime() - new Date(a.returnedAt).getTime() || a.login.localeCompare(b.login),
      );
  }
}
