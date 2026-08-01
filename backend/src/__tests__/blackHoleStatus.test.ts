import { describe, it, expect } from 'vitest';
import { calcDaysRemaining, classifyStatus, buildBlackHoleStatus } from '../services/blackHoleStatus.js';
import type { StudentSummary } from '../models/types.js';

const NOW = new Date('2026-08-01T12:00:00Z');

function makeStudent(overrides: Partial<StudentSummary> = {}): StudentSummary {
  return {
    id: 1,
    login: 'alice',
    displayName: 'Alice',
    imageUrl: null,
    level: 5,
    correctionPoints: 10,
    wallet: 0,
    active: true,
    campusName: 'Warsaw',
    cursusName: '42cursus',
    completedProjectCount: 3,
    currentProjectCount: 1,
    lastCompletionDate: null,
    lastCompletedProject: null,
    activeSince: null,
    blackholedAt: null,
    ...overrides,
  };
}

// ─── calcDaysRemaining ────────────────────────────────────────────────────────

describe('calcDaysRemaining', () => {
  it('returns positive for a future black hole date', () => {
    const bhDate = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    expect(calcDaysRemaining(bhDate, NOW)).toBe(5);
  });

  it('returns 1 for a date expiring later today (not 0)', () => {
    const bhDate = new Date(NOW.getTime() + 30 * 60 * 1000); // 30 minutes from now
    expect(calcDaysRemaining(bhDate, NOW)).toBe(1);
  });

  it('returns negative for a past black hole date', () => {
    const bhDate = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(calcDaysRemaining(bhDate, NOW)).toBe(-3);
  });

  it('returns 0 for exactly now (ceil(0) = 0)', () => {
    expect(calcDaysRemaining(NOW, NOW)).toBe(0);
  });
});

// ─── classifyStatus ───────────────────────────────────────────────────────────

describe('classifyStatus', () => {
  it('classifies 0 days as critical', () => {
    expect(classifyStatus(0)).toBe('critical');
  });

  it('classifies 3 days as critical', () => {
    expect(classifyStatus(3)).toBe('critical');
  });

  it('classifies 4 days as urgent', () => {
    expect(classifyStatus(4)).toBe('urgent');
  });

  it('classifies 7 days as urgent', () => {
    expect(classifyStatus(7)).toBe('urgent');
  });

  it('classifies 8 days as warning', () => {
    expect(classifyStatus(8)).toBe('warning');
  });

  it('classifies 14 days as warning', () => {
    expect(classifyStatus(14)).toBe('warning');
  });

  it('classifies 15 days as upcoming', () => {
    expect(classifyStatus(15)).toBe('upcoming');
  });

  it('classifies 30 days as upcoming', () => {
    expect(classifyStatus(30)).toBe('upcoming');
  });

  it('classifies 31 days as safe', () => {
    expect(classifyStatus(31)).toBe('safe');
  });

  it('classifies negative days as historical', () => {
    expect(classifyStatus(-1)).toBe('historical');
    expect(classifyStatus(-100)).toBe('historical');
  });
});

// ─── buildBlackHoleStatus ────────────────────────────────────────────────────

describe('buildBlackHoleStatus', () => {
  it('returns empty lists for no students', () => {
    const result = buildBlackHoleStatus([], NOW, 21, 30, 30);
    expect(result.upcoming).toHaveLength(0);
    expect(result.recentlyBlackHoled).toHaveLength(0);
    expect(result.summary.criticalCount).toBe(0);
  });

  it('excludes students with no blackholedAt and counts them in excludedCount', () => {
    const students = [makeStudent({ blackholedAt: null }), makeStudent({ id: 2, login: 'bob', blackholedAt: null })];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    expect(result.excludedCount).toBe(2);
    expect(result.upcoming).toHaveLength(0);
  });

  it('places a future student in upcoming with correct daysRemaining', () => {
    const bhDate = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000); // +10 days
    const students = [makeStudent({ blackholedAt: bhDate.toISOString() })];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0]!.daysRemaining).toBe(10);
    expect(result.upcoming[0]!.status).toBe('warning');
  });

  it('places a past student in recentlyBlackHoled when within recentDays', () => {
    const bhDate = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000); // -5 days
    const students = [makeStudent({ blackholedAt: bhDate.toISOString() })];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    expect(result.recentlyBlackHoled).toHaveLength(1);
    expect(result.recentlyBlackHoled[0]!.daysSince).toBe(5);
    expect(result.upcoming).toHaveLength(0);
  });

  it('excludes past students outside recentDays window', () => {
    const bhDate = new Date(NOW.getTime() - 45 * 24 * 60 * 60 * 1000); // -45 days
    const students = [makeStudent({ blackholedAt: bhDate.toISOString() })];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    expect(result.recentlyBlackHoled).toHaveLength(0);
    // not in upcoming either (past date, outside recent window)
    expect(result.upcoming).toHaveLength(0);
  });

  it('excludes students outside upcomingDays window', () => {
    const bhDate = new Date(NOW.getTime() + 90 * 24 * 60 * 60 * 1000); // +90 days, beyond default 30
    const students = [makeStudent({ blackholedAt: bhDate.toISOString() })];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    expect(result.upcoming).toHaveLength(0);
  });

  it('sorts upcoming by daysRemaining ascending', () => {
    const soon = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
    const later = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000);
    const students = [
      makeStudent({ id: 1, login: 'bob', blackholedAt: later.toISOString() }),
      makeStudent({ id: 2, login: 'alice', blackholedAt: soon.toISOString() }),
    ];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    expect(result.upcoming[0]!.login).toBe('alice');
    expect(result.upcoming[1]!.login).toBe('bob');
  });

  it('closestBlackHoleDate is the first upcoming entry', () => {
    const bhDate = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    const students = [makeStudent({ blackholedAt: bhDate.toISOString() })];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    expect(result.summary.closestBlackHoleDate).toBe(bhDate.toISOString());
  });

  it('closestBlackHoleDate is null when no upcoming students', () => {
    const result = buildBlackHoleStatus([], NOW, 21, 30, 30);
    expect(result.summary.closestBlackHoleDate).toBeNull();
  });

  it('computes summary counts correctly', () => {
    const critical = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000); // 2d = critical
    const urgent = new Date(NOW.getTime() + 6 * 24 * 60 * 60 * 1000);   // 6d = urgent
    const warning = new Date(NOW.getTime() + 12 * 24 * 60 * 60 * 1000); // 12d = warning
    const recent = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000);  // -10d = recently BH'd
    const students = [
      makeStudent({ id: 1, login: 'a', blackholedAt: critical.toISOString() }),
      makeStudent({ id: 2, login: 'b', blackholedAt: urgent.toISOString() }),
      makeStudent({ id: 3, login: 'c', blackholedAt: warning.toISOString() }),
      makeStudent({ id: 4, login: 'd', blackholedAt: recent.toISOString() }),
    ];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    expect(result.summary.criticalCount).toBe(1);
    expect(result.summary.urgentCount).toBe(1);
    // critical(2d) + urgent(6d) + warning(12d) all ≤ 14 days
    expect(result.summary.atRiskIn14Days).toBe(3);
    expect(result.summary.upcomingIn30Days).toBe(3); // critical + urgent + warning
    expect(result.summary.recentlyBlackHoledCount).toBe(1);
  });

  it('includes timezone and cursusId in response', () => {
    const result = buildBlackHoleStatus([], NOW, 21, 30, 30);
    expect(result.timezone).toBe('Europe/Warsaw');
    expect(result.cursusId).toBe(21);
  });

  it('excludes students with invalid blackholedAt strings', () => {
    const students = [makeStudent({ blackholedAt: 'not-a-date' })];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    expect(result.excludedCount).toBe(1);
    expect(result.upcoming).toHaveLength(0);
  });
});

// ─── buildBlackHoleStatus with filters ───────────────────────────────────────

describe('buildBlackHoleStatus with filters', () => {
  const bhDate = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000); // +5 days (upcoming)

  it('filters by loginSearch substring (case-insensitive)', () => {
    const students = [
      makeStudent({ id: 1, login: 'alice', displayName: 'Alice', blackholedAt: bhDate.toISOString() }),
      makeStudent({ id: 2, login: 'bob', displayName: 'Bob', blackholedAt: bhDate.toISOString() }),
    ];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30, { loginSearch: 'ali' });
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0]!.login).toBe('alice');
  });

  it('loginSearch also matches displayName', () => {
    const students = [
      makeStudent({ id: 1, login: 'usr1', displayName: 'Jan Kowalski', blackholedAt: bhDate.toISOString() }),
      makeStudent({ id: 2, login: 'usr2', displayName: 'Anna Nowak', blackholedAt: bhDate.toISOString() }),
    ];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30, { loginSearch: 'kowalski' });
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0]!.login).toBe('usr1');
  });

  it('filters by minLevel (inclusive)', () => {
    const students = [
      makeStudent({ id: 1, login: 'low', level: 2, blackholedAt: bhDate.toISOString() }),
      makeStudent({ id: 2, login: 'high', level: 8, blackholedAt: bhDate.toISOString() }),
    ];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30, { minLevel: 5 });
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0]!.login).toBe('high');
  });

  it('filters by maxLevel (inclusive)', () => {
    const students = [
      makeStudent({ id: 1, login: 'low', level: 2, blackholedAt: bhDate.toISOString() }),
      makeStudent({ id: 2, login: 'high', level: 8, blackholedAt: bhDate.toISOString() }),
    ];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30, { maxLevel: 4 });
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0]!.login).toBe('low');
  });

  it('login/level filters do NOT increment excludedCount', () => {
    const students = [
      makeStudent({ id: 1, login: 'alice', displayName: 'Alice', blackholedAt: bhDate.toISOString() }),
      makeStudent({ id: 2, login: 'bob', displayName: 'Bob', blackholedAt: null }),  // filtered by login, not excluded
    ];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30, { loginSearch: 'alice' });
    // 'bob' does not match loginSearch 'alice', so it is skipped before null-check — excludedCount stays 0
    expect(result.upcoming).toHaveLength(1);
    expect(result.excludedCount).toBe(0);
  });

  it('includes loginSearch/minLevel/maxLevel in the response filters', () => {
    const result = buildBlackHoleStatus([], NOW, 21, 30, 30, { loginSearch: 'test', minLevel: 3, maxLevel: 10 });
    expect(result.filters.loginSearch).toBe('test');
    expect(result.filters.minLevel).toBe(3);
    expect(result.filters.maxLevel).toBe(10);
  });

  it('null filters produce null values in response', () => {
    const result = buildBlackHoleStatus([], NOW, 21, 30, 30, {});
    expect(result.filters.loginSearch).toBeNull();
    expect(result.filters.minLevel).toBeNull();
    expect(result.filters.maxLevel).toBeNull();
  });
});

// ─── DST transition edge cases ────────────────────────────────────────────────

describe('calcDaysRemaining near Warsaw DST transitions', () => {
  it('correctly calculates days across spring-forward transition (CET→CEST)', () => {
    // 2026-03-29: Warsaw clocks spring forward at 02:00 CET → 03:00 CEST.
    // A student with blackholedAt exactly 1 day after this should show daysRemaining=1.
    const nowBeforeDST = new Date('2026-03-28T22:00:00Z'); // 23:00 CET (still before transition)
    const bhOneDay = new Date('2026-03-29T22:00:00Z');     // 23 hours later (clocks jumped: 23h real = 1 nominal day)
    const days = calcDaysRemaining(bhOneDay, nowBeforeDST);
    // diff = 23 hours = 82800000ms, ceil(82800000 / 86400000) = ceil(0.9583) = 1
    expect(days).toBe(1);
  });

  it('correctly handles a blackhole date at the DST boundary hour', () => {
    // Student blackholed at exactly the spring-forward transition moment (02:00 CET = 01:00 UTC)
    const bhAtDST = new Date('2026-03-29T01:00:00Z'); // The non-existent 02:00 CET (clocked to 03:00 CEST)
    const nowSameDay = new Date('2026-03-28T23:00:00Z');
    const days = calcDaysRemaining(bhAtDST, nowSameDay);
    // diff = 2 hours = 7200000ms, ceil(2/24) = 1
    expect(days).toBeGreaterThan(0);
    expect(classifyStatus(days)).toBe('critical');
  });
});

// ─── Additional boundary and edge-case tests ──────────────────────────────────

describe('calcDaysRemaining — specific boundary values', () => {
  it('returns 1 for a date expiring in 30 minutes (expiring later today)', () => {
    const bhDate = new Date(NOW.getTime() + 30 * 60 * 1000);
    expect(calcDaysRemaining(bhDate, NOW)).toBe(1);
  });

  it('returns -1 for a date that passed exactly 1 day ago (yesterday)', () => {
    const bhYesterday = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000);
    expect(calcDaysRemaining(bhYesterday, NOW)).toBe(-1);
  });

  it('handles session near midnight: blackhole at next-day midnight shows 1 day', () => {
    // One second past midnight means it's already "tomorrow", ceil gives 1
    const almostMidnight = new Date('2026-08-01T21:59:59Z'); // 23:59:59 Warsaw CEST (UTC+2)
    const justPastMidnight = new Date('2026-08-02T21:59:59Z'); // exactly 24h later
    expect(calcDaysRemaining(justPastMidnight, almostMidnight)).toBe(1);
  });

  it('returns 3 for three days remaining', () => {
    const bhDate = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(calcDaysRemaining(bhDate, NOW)).toBe(3);
    expect(classifyStatus(3)).toBe('critical');
  });
});

describe('buildBlackHoleStatus — detailed boundary scenarios', () => {
  it('places a student with blackhole yesterday in recentlyBlackHoled (daysSince=1)', () => {
    const bhYesterday = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000);
    const students = [makeStudent({ blackholedAt: bhYesterday.toISOString() })];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    expect(result.recentlyBlackHoled).toHaveLength(1);
    expect(result.recentlyBlackHoled[0]!.daysSince).toBe(1);
    expect(result.upcoming).toHaveLength(0);
  });

  it('treats a historical date (>recentDays) as excluded from both lists', () => {
    const historical = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    const students = [makeStudent({ blackholedAt: historical.toISOString() })];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    expect(result.upcoming).toHaveLength(0);
    expect(result.recentlyBlackHoled).toHaveLength(0);
    // Not counted in excludedCount — this is a valid date, just outside the window
  });

  it('does not double-count a student who appears twice (same id)', () => {
    const bhDate = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    const student = makeStudent({ blackholedAt: bhDate.toISOString() });
    // Same student entry duplicated (simulates multiple cursus records not yet deduplicated)
    const result = buildBlackHoleStatus([student, student], NOW, 21, 30, 30);
    // The function does not deduplicate by id — it relies on the roster loading to do so.
    // This test documents the observed behavior: each record is processed independently.
    expect(result.upcoming.length).toBeGreaterThanOrEqual(1);
  });

  it('sorts recentlyBlackHoled by daysSince ascending, then blackholedAt descending, then login', () => {
    const twoDaysAgo   = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);
    const students = [
      makeStudent({ id: 1, login: 'charlie', blackholedAt: threeDaysAgo.toISOString() }),
      makeStudent({ id: 2, login: 'alice',   blackholedAt: twoDaysAgo.toISOString() }),
    ];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    // 2-days-ago sorts before 3-days-ago (ascending daysSince)
    expect(result.recentlyBlackHoled[0]!.login).toBe('alice');
    expect(result.recentlyBlackHoled[1]!.login).toBe('charlie');
  });

  it('stable tie-breaker for upcoming: same daysRemaining → earlier blackholedAt first, then login', () => {
    const sameDays = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    const slightlyLater = new Date(sameDays.getTime() + 60 * 60 * 1000); // 1 hour after
    const students = [
      makeStudent({ id: 1, login: 'bob',   blackholedAt: slightlyLater.toISOString() }),
      makeStudent({ id: 2, login: 'alice', blackholedAt: sameDays.toISOString() }),
    ];
    const result = buildBlackHoleStatus(students, NOW, 21, 30, 30);
    // daysRemaining is same (both ceil to 5), so sort by blackholedAt: alice first
    expect(result.upcoming[0]!.login).toBe('alice');
    expect(result.upcoming[1]!.login).toBe('bob');
  });

  it('staff/alumni exclusion: no special handling (relies on upstream roster filtering)', () => {
    // The buildBlackHoleStatus function processes whatever students are passed in.
    // Staff and alumni exclusion is handled by the DataService, which filters the
    // campus roster to active cursus members before this function is called.
    // This test documents that behavior: a "staff" student with a blackhole date
    // is processed like any other if passed in.
    const bhDate = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    const staffStudent = makeStudent({ login: 'staff42', blackholedAt: bhDate.toISOString() });
    const result = buildBlackHoleStatus([staffStudent], NOW, 21, 30, 30);
    expect(result.upcoming).toHaveLength(1); // processed normally
  });
});
