import type {
  ActiveSessionEntry,
  AchievementEntry,
  BlackHoleWatchEntry,
  ProjectCompletion,
  StudentSummary,
  XpLeaderboardEntry,
} from '../models/types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A final mark at or above this threshold triggers the full-screen takeover celebration. */
export const TAKEOVER_MARK_THRESHOLD = 100;

/** Students currently on campus, longest session first, for the "Hive" live node map. */
export function buildActiveNow(students: StudentSummary[], referenceDate: Date, limit: number): ActiveSessionEntry[] {
  return students
    .filter((s): s is StudentSummary & { activeSince: string } => s.activeSince !== null)
    .map((s) => ({
      id: s.id,
      login: s.login,
      displayName: s.displayName,
      imageUrl: s.imageUrl,
      level: s.level,
      activeSince: s.activeSince,
      sessionMinutes: Math.max(0, Math.round((referenceDate.getTime() - new Date(s.activeSince).getTime()) / 60_000)),
    }))
    .sort((a, b) => b.sessionMinutes - a.sessionMinutes)
    .slice(0, limit);
}

/**
 * Sums final marks on validated completions in the trailing `days` window, per student. This is
 * the proxy metric underlying both the "Weekly XP race" leaderboard below and the coalition
 * leaderboard's weekly top-contributor spotlight (see coalitions.ts buildWeeklyTopContributors) -
 * not official 42 XP/transactions data (see docs/LIMITATIONS.md).
 */
export function computeWeeklyXpByStudent(
  completions: ProjectCompletion[],
  days: number,
  referenceDate: Date,
): Map<number, XpLeaderboardEntry> {
  const since = new Date(referenceDate.getTime() - days * DAY_MS);
  const byStudent = new Map<number, XpLeaderboardEntry>();

  for (const completion of completions) {
    if (!completion.validated || completion.finalMark === null) continue;
    if (new Date(completion.completedAt) < since) continue;

    const existing = byStudent.get(completion.studentId);
    if (existing) {
      existing.weeklyXp += completion.finalMark;
    } else {
      byStudent.set(completion.studentId, {
        id: completion.studentId,
        login: completion.login,
        displayName: completion.displayName,
        imageUrl: completion.imageUrl,
        weeklyXp: completion.finalMark,
      });
    }
  }

  return byStudent;
}

/** Weekly XP leaderboard - see computeWeeklyXpByStudent() for what `weeklyXp` means. */
export function buildXpLeaderboard(
  completions: ProjectCompletion[],
  days: number,
  referenceDate: Date,
  limit: number,
): XpLeaderboardEntry[] {
  const byStudent = computeWeeklyXpByStudent(completions, days, referenceDate);
  return Array.from(byStudent.values())
    .sort((a, b) => b.weeklyXp - a.weeklyXp)
    .slice(0, limit);
}

/** Students with a future black hole date, soonest first, for the danger-zone tracker. */
export function buildBlackHoleWatch(students: StudentSummary[], referenceDate: Date, limit: number): BlackHoleWatchEntry[] {
  return students
    .filter((s): s is StudentSummary & { blackholedAt: string } => s.blackholedAt !== null && new Date(s.blackholedAt) > referenceDate)
    .map((s) => ({
      id: s.id,
      login: s.login,
      displayName: s.displayName,
      imageUrl: s.imageUrl,
      blackholedAt: s.blackholedAt,
      daysRemaining: Math.ceil((new Date(s.blackholedAt).getTime() - referenceDate.getTime()) / DAY_MS),
    }))
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .slice(0, limit);
}

/** Recent validated completions, newest first, flagged for the full-screen takeover celebration. */
export function buildAchievementFeed(
  completions: ProjectCompletion[],
  days: number,
  referenceDate: Date,
  limit: number,
): AchievementEntry[] {
  const since = new Date(referenceDate.getTime() - days * DAY_MS);

  return completions
    .filter((c) => c.validated && new Date(c.completedAt) >= since)
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .slice(0, limit)
    .map((c) => ({ ...c, isTakeover: c.finalMark !== null && c.finalMark >= TAKEOVER_MARK_THRESHOLD }));
}
