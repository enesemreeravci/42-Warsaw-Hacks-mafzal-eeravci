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
