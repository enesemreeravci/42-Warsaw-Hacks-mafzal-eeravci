import { describe, expect, it } from 'vitest';
import {
  aggregateWeeklyActivity,
  buildValidStudentIds,
  buildWeeklyCampusActivity,
  calculateSessionOverlapMs,
  formatMinutesAsHoursAndMinutes,
  getLastSevenDaysRange,
  rankByCampusTime,
  rankBySessionCount,
} from '../services/weeklyCampusActivity.js';
import type { RawCursusUser, RawLocation, RawUser } from '../models/types.js';

const NOW = new Date('2026-07-31T12:00:00.000Z');
const RANGE_START = new Date('2026-07-24T12:00:00.000Z');
const RANGE_END = NOW;
const CAMPUS_ID = 67;
const CURSUS_ID = 21;

function fakeUser(overrides: Partial<RawUser> & { id: number }): RawUser {
  return { login: `student${overrides.id}`, ...overrides };
}

function fakeCursusUser(userId: number, overrides: Partial<RawCursusUser> = {}): RawCursusUser {
  return { id: userId, user: fakeUser({ id: userId }), ...overrides };
}

function fakeLocation(overrides: Partial<RawLocation> & { id: number; user?: RawUser }): RawLocation {
  return {
    begin_at: '2026-07-30T08:00:00.000Z',
    end_at: '2026-07-30T10:00:00.000Z',
    campus_id: CAMPUS_ID,
    host: 'c1r1p1',
    ...overrides,
  };
}

describe('getLastSevenDaysRange', () => {
  it('ends at "now" and starts exactly 7 days before, without hardcoding dates', () => {
    const { start, end } = getLastSevenDaysRange(NOW);
    expect(end.toISOString()).toBe(NOW.toISOString());
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('buildValidStudentIds', () => {
  it('builds a Set of user IDs from cursus_users records', () => {
    const ids = buildValidStudentIds([fakeCursusUser(1), fakeCursusUser(2)]);
    expect(ids).toEqual(new Set([1, 2]));
  });

  it('skips records with no embedded user (e.g. malformed rows)', () => {
    const ids = buildValidStudentIds([fakeCursusUser(1), { id: 99 }]);
    expect(ids).toEqual(new Set([1]));
  });

  it('deduplicates repeated user IDs across records', () => {
    const ids = buildValidStudentIds([fakeCursusUser(1), fakeCursusUser(1)]);
    expect(ids.size).toBe(1);
  });
});

describe('calculateSessionOverlapMs', () => {
  it('uses "now" as the effective end when end_at is null (still-active session)', () => {
    const ms = calculateSessionOverlapMs('2026-07-31T10:00:00.000Z', null, RANGE_START, RANGE_END, NOW);
    expect(ms).toBe(2 * 60 * 60 * 1000); // 10:00 -> now (12:00)
  });

  it('clamps a session that starts before the range to the range start', () => {
    const ms = calculateSessionOverlapMs('2026-07-01T00:00:00.000Z', '2026-07-24T13:00:00.000Z', RANGE_START, RANGE_END, NOW);
    expect(ms).toBe(60 * 60 * 1000); // 12:00 -> 13:00 within range
  });

  it('clamps a session that ends after the range to the range end', () => {
    const ms = calculateSessionOverlapMs('2026-07-31T11:00:00.000Z', '2026-08-05T00:00:00.000Z', RANGE_START, RANGE_END, NOW);
    expect(ms).toBe(60 * 60 * 1000); // 11:00 -> range end (12:00)
  });

  it('returns 0 for a session entirely outside the range (never negative)', () => {
    const ms = calculateSessionOverlapMs('2026-06-01T00:00:00.000Z', '2026-06-02T00:00:00.000Z', RANGE_START, RANGE_END, NOW);
    expect(ms).toBe(0);
  });

  it('returns 0 for a missing begin_at instead of throwing', () => {
    expect(calculateSessionOverlapMs(undefined, null, RANGE_START, RANGE_END, NOW)).toBe(0);
  });

  it('returns 0 for an unparsable begin_at instead of throwing', () => {
    expect(calculateSessionOverlapMs('not-a-date', null, RANGE_START, RANGE_END, NOW)).toBe(0);
  });
});

describe('formatMinutesAsHoursAndMinutes', () => {
  it('formats whole hours and minutes', () => {
    expect(formatMinutesAsHoursAndMinutes(150)).toBe('2h 30m');
  });

  it('never renders NaN/negative for invalid input', () => {
    expect(formatMinutesAsHoursAndMinutes(Number.NaN)).toBe('0h 0m');
    expect(formatMinutesAsHoursAndMinutes(-5)).toBe('0h 0m');
  });
});

describe('aggregateWeeklyActivity', () => {
  it('groups sessions by user and sums duration/session count/unique hosts', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: fakeUser({ id: 1 }), begin_at: '2026-07-30T08:00:00.000Z', end_at: '2026-07-30T10:00:00.000Z', host: 'c1r1p1' }),
      fakeLocation({ id: 2, user: fakeUser({ id: 1 }), begin_at: '2026-07-30T12:00:00.000Z', end_at: '2026-07-30T13:00:00.000Z', host: 'c1r1p2' }),
    ];

    const result = aggregateWeeklyActivity(locations, { start: RANGE_START, end: RANGE_END }, NOW);

    expect(result.locationRecordsProcessed).toBe(2);
    expect(result.students).toHaveLength(1);
    expect(result.students[0]).toMatchObject({ userId: 1, sessionCount: 2, totalMinutes: 180, uniqueHostCount: 2 });
  });

  it('skips a record with no user, no id, or no begin_at without crashing', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: undefined }),
      { id: 2, begin_at: '', end_at: null } as RawLocation,
      fakeLocation({ id: 3, user: fakeUser({ id: 5 }) }),
    ];

    const result = aggregateWeeklyActivity(locations, { start: RANGE_START, end: RANGE_END }, NOW);

    expect(result.locationRecordsProcessed).toBe(1);
    expect(result.students.map((s) => s.userId)).toEqual([5]);
  });

  it('computes averageSessionMinutes correctly', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: fakeUser({ id: 1 }), begin_at: '2026-07-30T08:00:00.000Z', end_at: '2026-07-30T09:00:00.000Z' }),
      fakeLocation({ id: 2, user: fakeUser({ id: 1 }), begin_at: '2026-07-30T10:00:00.000Z', end_at: '2026-07-30T13:00:00.000Z' }),
    ];

    const result = aggregateWeeklyActivity(locations, { start: RANGE_START, end: RANGE_END }, NOW);

    // 60min + 180min = 240min over 2 sessions -> 120min average
    expect(result.students[0]).toMatchObject({ totalMinutes: 240, sessionCount: 2, averageSessionMinutes: 120 });
  });

  it('returns empty rankings/aggregates for empty input', () => {
    const result = aggregateWeeklyActivity([], { start: RANGE_START, end: RANGE_END }, NOW);
    expect(result.students).toEqual([]);
    expect(result.locationRecordsProcessed).toBe(0);
    expect(result.totalCampusMinutes).toBe(0);
    expect(result.totalSessions).toBe(0);
  });
});

function internalStudent(overrides: Partial<{ userId: number; login: string; totalMs: number; sessionCount: number }>) {
  return {
    userId: overrides.userId ?? 1,
    login: overrides.login ?? `student${overrides.userId ?? 1}`,
    displayName: overrides.login ?? `student${overrides.userId ?? 1}`,
    imageUrl: null,
    totalMs: overrides.totalMs ?? 0,
    totalMinutes: Math.round((overrides.totalMs ?? 0) / 60_000),
    totalHours: 0,
    sessionCount: overrides.sessionCount ?? 0,
    averageSessionMinutes: 0,
    uniqueHostCount: 0,
  };
}

describe('rankByCampusTime', () => {
  it('sorts descending by total time', () => {
    const students = [internalStudent({ userId: 1, totalMs: 1000 }), internalStudent({ userId: 2, totalMs: 5000 })];
    const ranked = rankByCampusTime(students);
    expect(ranked.map((s) => s.userId)).toEqual([2, 1]);
  });

  it('breaks ties on session count, then alphabetical login, deterministically', () => {
    const students = [
      internalStudent({ userId: 1, login: 'zara', totalMs: 1000, sessionCount: 1 }),
      internalStudent({ userId: 2, login: 'alan', totalMs: 1000, sessionCount: 3 }),
      internalStudent({ userId: 3, login: 'brad', totalMs: 1000, sessionCount: 1 }),
    ];
    const ranked = rankByCampusTime(students);
    // equal totalMs -> higher sessionCount first (2), then alphabetical among the remaining tie (3 before 1)
    expect(ranked.map((s) => s.userId)).toEqual([2, 3, 1]);
  });

  it('limits to the requested top N', () => {
    const students = Array.from({ length: 15 }, (_, i) => internalStudent({ userId: i, totalMs: i }));
    expect(rankByCampusTime(students, 10)).toHaveLength(10);
  });
});

describe('rankBySessionCount', () => {
  it('sorts descending by session count', () => {
    const students = [internalStudent({ userId: 1, sessionCount: 2 }), internalStudent({ userId: 2, sessionCount: 9 })];
    const ranked = rankBySessionCount(students);
    expect(ranked.map((s) => s.userId)).toEqual([2, 1]);
  });

  it('breaks ties on total time, then alphabetical login, deterministically', () => {
    const students = [
      internalStudent({ userId: 1, login: 'zara', sessionCount: 2, totalMs: 1000 }),
      internalStudent({ userId: 2, login: 'alan', sessionCount: 2, totalMs: 5000 }),
      internalStudent({ userId: 3, login: 'brad', sessionCount: 2, totalMs: 1000 }),
    ];
    const ranked = rankBySessionCount(students);
    expect(ranked.map((s) => s.userId)).toEqual([2, 3, 1]);
  });
});

describe('buildWeeklyCampusActivity', () => {
  const cursusUsers = [fakeCursusUser(1), fakeCursusUser(2)];

  it('only includes campus 67 location records', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: fakeUser({ id: 1 }), campus_id: 67 }),
      fakeLocation({ id: 2, user: fakeUser({ id: 1 }), campus_id: 99 }), // wrong campus
    ];

    const result = buildWeeklyCampusActivity({
      cursusUsers,
      locations,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
      period: { start: RANGE_START, end: RANGE_END },
      now: NOW,
    });

    expect(result.summary.locationRecordsProcessed).toBe(1);
  });

  it('excludes users outside validStudentIds (Pisciners / other cursus / staff)', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: fakeUser({ id: 1 }) }), // valid, id 1 is in cursusUsers
      fakeLocation({ id: 2, user: fakeUser({ id: 999 }) }), // not in cursusUsers -> excluded
    ];

    const result = buildWeeklyCampusActivity({
      cursusUsers,
      locations,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
      period: { start: RANGE_START, end: RANGE_END },
      now: NOW,
    });

    expect(result.summary.uniqueActiveStudents).toBe(1);
    expect(result.mostCampusTime.every((s) => s.userId !== 999)).toBe(true);
  });

  it('produces empty rankings for empty location input, not an error', () => {
    const result = buildWeeklyCampusActivity({
      cursusUsers,
      locations: [],
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
      period: { start: RANGE_START, end: RANGE_END },
      now: NOW,
    });

    expect(result.mostCampusTime).toEqual([]);
    expect(result.mostSessionsStarted).toEqual([]);
    expect(result.summary.uniqueActiveStudents).toBe(0);
  });

  it('includes the begin_at-range API limitation in meta, and correct campus/cursus IDs', () => {
    const result = buildWeeklyCampusActivity({
      cursusUsers,
      locations: [],
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
      period: { start: RANGE_START, end: RANGE_END },
      now: NOW,
    });

    expect(result.meta.campusId).toBe(67);
    expect(result.meta.cursusId).toBe(21);
    expect(result.meta.source).toBe('42-api');
    expect(result.meta.limitation).toMatch(/begin_at/);
  });

  it('never renders NaN/undefined-producing values for a single clean session', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: fakeUser({ id: 1 }), begin_at: '2026-07-30T08:00:00.000Z', end_at: '2026-07-30T09:00:00.000Z' }),
    ];

    const result = buildWeeklyCampusActivity({
      cursusUsers,
      locations,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
      period: { start: RANGE_START, end: RANGE_END },
      now: NOW,
    });

    const [entry] = result.mostCampusTime;
    expect(entry).toBeDefined();
    for (const value of Object.values(entry!)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});
