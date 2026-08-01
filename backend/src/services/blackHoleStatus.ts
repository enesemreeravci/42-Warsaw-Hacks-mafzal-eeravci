import type {
  BlackHoleRecentEntry,
  BlackHoleStatusCategory,
  BlackHoleStatusResponse,
  BlackHoleSummary,
  BlackHoleUpcomingEntry,
  StudentSummary,
} from '../models/types.js';

const WARSAW_TZ = 'Europe/Warsaw';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days until the black hole, using ceil so a student expiring later today shows 1, not 0.
 * Returns a negative value for students already black-holed.
 */
export function calcDaysRemaining(blackholedAt: Date, now: Date): number {
  return Math.ceil((blackholedAt.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Assigns a status category based on days remaining.
 * critical: 0-3 days  urgent: 4-7  warning: 8-14  upcoming: 15-30  safe: >30
 * Negative values are historical (already black-holed); the caller separates these
 * into the `recentlyBlackHoled` list rather than showing them in `upcoming`.
 */
export function classifyStatus(daysRemaining: number): BlackHoleStatusCategory {
  if (daysRemaining < 0) return 'historical';
  if (daysRemaining <= 3) return 'critical';
  if (daysRemaining <= 7) return 'urgent';
  if (daysRemaining <= 14) return 'warning';
  if (daysRemaining <= 30) return 'upcoming';
  return 'safe';
}

/**
 * Builds the black hole status response from the current campus roster.
 *
 * `upcomingDays`  — window for the "Closest to Black Hole" list (default 30).
 * `recentDays`    — lookback window for the "Recently Black Holed" list (default 30).
 *
 * Students whose `blackholedAt` is null (no black hole date or not applicable) are counted in
 * `excludedCount` and omitted from both lists — they are not black-holed; the absence of a date
 * is a normal state for many active subscription plans.
 */
export function buildBlackHoleStatus(
  students: StudentSummary[],
  now: Date,
  cursusId: number,
  upcomingDays = 30,
  recentDays = 30,
): BlackHoleStatusResponse {
  let excludedCount = 0;
  const upcoming: BlackHoleUpcomingEntry[] = [];
  const recentlyBlackHoled: BlackHoleRecentEntry[] = [];

  for (const student of students) {
    if (!student.blackholedAt) {
      excludedCount++;
      continue;
    }

    const bhDate = new Date(student.blackholedAt);
    if (isNaN(bhDate.getTime())) {
      excludedCount++;
      continue;
    }

    const daysRemaining = calcDaysRemaining(bhDate, now);

    if (daysRemaining >= 0 && daysRemaining <= upcomingDays) {
      upcoming.push({
        id: student.id,
        login: student.login,
        displayName: student.displayName,
        imageUrl: student.imageUrl,
        level: student.level,
        blackholedAt: student.blackholedAt,
        daysRemaining,
        status: classifyStatus(daysRemaining),
      });
    } else if (daysRemaining < 0) {
      const daysSince = Math.floor((now.getTime() - bhDate.getTime()) / DAY_MS);
      if (daysSince <= recentDays) {
        recentlyBlackHoled.push({
          id: student.id,
          login: student.login,
          displayName: student.displayName,
          imageUrl: student.imageUrl,
          level: student.level,
          blackholedAt: student.blackholedAt,
          daysSince,
        });
      }
    }
  }

  // Upcoming: soonest first, then by login
  upcoming.sort(
    (a, b) =>
      a.daysRemaining - b.daysRemaining ||
      new Date(a.blackholedAt).getTime() - new Date(b.blackholedAt).getTime() ||
      a.login.localeCompare(b.login),
  );

  // Recently black-holed: most recent first (fewest daysSince), then by login
  recentlyBlackHoled.sort(
    (a, b) =>
      a.daysSince - b.daysSince ||
      new Date(b.blackholedAt).getTime() - new Date(a.blackholedAt).getTime() ||
      a.login.localeCompare(b.login),
  );

  const summary: BlackHoleSummary = {
    criticalCount: upcoming.filter((u) => u.status === 'critical').length,
    urgentCount: upcoming.filter((u) => u.status === 'urgent').length,
    atRiskIn14Days: upcoming.filter((u) => u.daysRemaining <= 14).length,
    upcomingIn30Days: upcoming.filter((u) => u.daysRemaining <= 30).length,
    recentlyBlackHoledCount: recentlyBlackHoled.length,
    closestBlackHoleDate: upcoming[0]?.blackholedAt ?? null,
  };

  return {
    generatedAt: now.toISOString(),
    timezone: WARSAW_TZ,
    cursusId,
    filters: { upcomingDays, recentDays },
    summary,
    upcoming,
    recentlyBlackHoled,
    excludedCount,
  };
}
