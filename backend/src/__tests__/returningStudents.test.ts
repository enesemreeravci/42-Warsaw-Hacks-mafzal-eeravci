import { describe, expect, it } from 'vitest';
import { buildReturningStudents, type ReturningStudentCoalitionRef } from '../services/returningStudents.js';
import type { RawLocation, RawUser, StudentSummary } from '../models/types.js';

const NOW = new Date('2026-07-31T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD = { start: new Date(NOW.getTime() - 7 * DAY_MS), end: NOW };
const CAMPUS_ID = 67;
const CURSUS_ID = 21;

function fakeUser(overrides: Partial<RawUser> & { id: number }): RawUser {
  return { login: `student${overrides.id}`, ...overrides };
}

function fakeLocation(overrides: Partial<RawLocation> & { id: number; user?: RawUser }): RawLocation {
  return { begin_at: '2026-07-30T08:00:00.000Z', end_at: '2026-07-30T10:00:00.000Z', campus_id: CAMPUS_ID, ...overrides };
}

function fakeStudent(overrides: Partial<StudentSummary> & { id: number }): StudentSummary {
  return {
    login: `student${overrides.id}`,
    displayName: `Student ${overrides.id}`,
    imageUrl: null,
    level: 5,
    correctionPoints: 0,
    wallet: 0,
    active: true,
    campusName: 'Warsaw',
    cursusName: '42cursus',
    completedProjectCount: 0,
    currentProjectCount: 0,
    lastCompletionDate: null,
    lastCompletedProject: null,
    activeSince: null,
    blackholedAt: null,
    ...overrides,
  };
}

const studentsById = new Map([[1, fakeStudent({ id: 1, login: 'eeravci', level: 8.42 })]]);
const validStudentIds = new Set([1]);
const coalitionByUserId = new Map<number, ReturningStudentCoalitionRef>([[1, { name: 'Freax', color: '#fff' }]]);

function build(locations: RawLocation[], overrides: Partial<Parameters<typeof buildReturningStudents>[0]> = {}) {
  return buildReturningStudents({
    locations,
    validStudentIds,
    studentsById,
    coalitionByUserId,
    activeNowUserIds: new Set(),
    period: PERIOD,
    thresholdDays: 14,
    sort: 'recent',
    campusId: CAMPUS_ID,
    cursusId: CURSUS_ID,
    now: NOW,
    source: '42-api',
    ...overrides,
  });
}

describe('buildReturningStudents', () => {
  it('classifies a student as returning when the gap before their in-period session meets the threshold', () => {
    const locations: RawLocation[] = [
      // Previous visit, well outside the threshold window before the return.
      fakeLocation({ id: 1, user: fakeUser({ id: 1 }), begin_at: '2026-07-01T10:00:00.000Z', end_at: '2026-07-01T12:00:00.000Z' }),
      // Return session, inside the 7-day reporting period.
      fakeLocation({ id: 2, user: fakeUser({ id: 1 }), begin_at: '2026-07-30T10:00:00.000Z', end_at: '2026-07-30T12:00:00.000Z' }),
    ];

    const result = build(locations);

    expect(result.totalReturningStudents).toBe(1);
    expect(result.students[0]).toMatchObject({
      userId: 1,
      login: 'eeravci',
      returnedAt: '2026-07-30T10:00:00.000Z',
      previousVisitAt: '2026-07-01T12:00:00.000Z',
      inactiveDays: 28,
      coalition: { name: 'Freax', color: '#fff' },
    });
  });

  it('does not classify a student whose gap is under the threshold', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: fakeUser({ id: 1 }), begin_at: '2026-07-28T10:00:00.000Z', end_at: '2026-07-28T12:00:00.000Z' }),
      fakeLocation({ id: 2, user: fakeUser({ id: 1 }), begin_at: '2026-07-30T10:00:00.000Z', end_at: '2026-07-30T12:00:00.000Z' }),
    ];

    // Gap here is ~2 days, under the 14-day threshold.
    expect(build(locations).totalReturningStudents).toBe(0);
  });

  it('does not classify a student active during the inactivity window (a session between previous and return)', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: fakeUser({ id: 1 }), begin_at: '2026-07-01T10:00:00.000Z', end_at: '2026-07-01T12:00:00.000Z' }),
      // A session mid-gap - this becomes the new "previous session", closing the long gap.
      fakeLocation({ id: 2, user: fakeUser({ id: 1 }), begin_at: '2026-07-25T10:00:00.000Z', end_at: '2026-07-25T12:00:00.000Z' }),
      fakeLocation({ id: 3, user: fakeUser({ id: 1 }), begin_at: '2026-07-30T10:00:00.000Z', end_at: '2026-07-30T12:00:00.000Z' }),
    ];

    expect(build(locations).totalReturningStudents).toBe(0);
  });

  it('excludes a student whose in-period session is the only/first one in the fetch window (unknown prior gap)', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: fakeUser({ id: 1 }), begin_at: '2026-07-30T10:00:00.000Z', end_at: '2026-07-30T12:00:00.000Z' }),
    ];

    expect(build(locations).totalReturningStudents).toBe(0);
  });

  it('excludes a student when the previous session has no reliable end_at, rather than guessing', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: fakeUser({ id: 1 }), begin_at: '2026-07-01T10:00:00.000Z', end_at: null }),
      fakeLocation({ id: 2, user: fakeUser({ id: 1 }), begin_at: '2026-07-30T10:00:00.000Z', end_at: '2026-07-30T12:00:00.000Z' }),
    ];

    expect(build(locations).totalReturningStudents).toBe(0);
  });

  it('excludes sessions for users not in the campus roster', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: fakeUser({ id: 999 }), begin_at: '2026-07-01T10:00:00.000Z', end_at: '2026-07-01T12:00:00.000Z' }),
      fakeLocation({ id: 2, user: fakeUser({ id: 999 }), begin_at: '2026-07-30T10:00:00.000Z', end_at: '2026-07-30T12:00:00.000Z' }),
    ];

    expect(build(locations).totalReturningStudents).toBe(0);
  });

  it('flags currentlyOnline and host only when the student is in activeNowUserIds', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: fakeUser({ id: 1 }), begin_at: '2026-07-01T10:00:00.000Z', end_at: '2026-07-01T12:00:00.000Z' }),
      fakeLocation({
        id: 2,
        user: fakeUser({ id: 1 }),
        host: 'c3r12s4',
        begin_at: '2026-07-30T10:00:00.000Z',
        end_at: '2026-07-30T12:00:00.000Z',
      }),
    ];

    const online = build(locations, { activeNowUserIds: new Set([1]) });
    expect(online.students[0]).toMatchObject({ currentlyOnline: true, host: 'c3r12s4' });

    const offline = build(locations, { activeNowUserIds: new Set() });
    expect(offline.students[0]).toMatchObject({ currentlyOnline: false, host: null });
  });

  it('sorts by longestAbsence, level, and login when requested', () => {
    const twoStudents = new Map([
      [1, fakeStudent({ id: 1, login: 'zed', level: 3 })],
      [2, fakeStudent({ id: 2, login: 'amy', level: 9 })],
    ]);
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, user: fakeUser({ id: 1 }), begin_at: '2026-06-01T10:00:00.000Z', end_at: '2026-06-01T12:00:00.000Z' }),
      fakeLocation({ id: 2, user: fakeUser({ id: 1 }), begin_at: '2026-07-30T10:00:00.000Z', end_at: '2026-07-30T12:00:00.000Z' }), // long absence
      fakeLocation({ id: 3, user: fakeUser({ id: 2 }), begin_at: '2026-07-10T10:00:00.000Z', end_at: '2026-07-10T12:00:00.000Z' }),
      fakeLocation({ id: 4, user: fakeUser({ id: 2 }), begin_at: '2026-07-29T10:00:00.000Z', end_at: '2026-07-29T12:00:00.000Z' }), // shorter absence
    ];

    const byAbsence = build(locations, { studentsById: twoStudents, validStudentIds: new Set([1, 2]), sort: 'longestAbsence' });
    expect(byAbsence.students.map((s) => s.login)).toEqual(['zed', 'amy']);

    const byLevel = build(locations, { studentsById: twoStudents, validStudentIds: new Set([1, 2]), sort: 'level' });
    expect(byLevel.students.map((s) => s.login)).toEqual(['amy', 'zed']);

    const byLogin = build(locations, { studentsById: twoStudents, validStudentIds: new Set([1, 2]), sort: 'login' });
    expect(byLogin.students.map((s) => s.login)).toEqual(['amy', 'zed']);
  });

  it('returns an empty list for empty input, not an error', () => {
    const result = build([]);
    expect(result.totalReturningStudents).toBe(0);
    expect(result.students).toEqual([]);
    expect(result.meta.limitation).toMatch(/lookback window/);
  });
});
