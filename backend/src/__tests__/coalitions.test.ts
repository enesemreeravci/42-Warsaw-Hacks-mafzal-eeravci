import { describe, expect, it } from 'vitest';
import { buildCoalitionStandings, buildTopContributors, buildWeeklyPointsByCoalition, buildWeeklyTopContributors } from '../services/coalitions.js';
import type { ProjectCompletion, RawCoalition, RawCoalitionUser, StudentSummary } from '../models/types.js';

const NOW = new Date('2026-07-31T12:00:00.000Z');

function fakeStudent(overrides: Partial<StudentSummary> & { id: number }): StudentSummary {
  return {
    login: `student${overrides.id}`,
    displayName: `Student ${overrides.id}`,
    imageUrl: null,
    level: 1,
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

function fakeCompletion(overrides: Partial<ProjectCompletion> & { studentId: number }): ProjectCompletion {
  return {
    projectUserId: overrides.studentId * 1000,
    login: `student${overrides.studentId}`,
    displayName: `Student ${overrides.studentId}`,
    imageUrl: null,
    projectId: 1,
    projectName: 'Libft',
    finalMark: 100,
    validated: true,
    status: 'finished',
    completedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('buildCoalitionStandings', () => {
  it('sorts by score descending and assigns 1-based ranks', () => {
    const raw: RawCoalition[] = [
      { id: 1, name: 'A', slug: 'a', score: 100 },
      { id: 2, name: 'B', slug: 'b', score: 300 },
      { id: 3, name: 'C', slug: 'c', score: 200 },
    ];

    const standings = buildCoalitionStandings(raw);

    expect(standings.map((s) => s.id)).toEqual([2, 3, 1]);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it('treats a missing score as 0 rather than crashing', () => {
    const raw: RawCoalition[] = [{ id: 1, name: 'A', slug: 'a' }];
    const standings = buildCoalitionStandings(raw);
    expect(standings[0]!.score).toBe(0);
  });

  it('maps image_url/color with null fallbacks', () => {
    const raw: RawCoalition[] = [{ id: 1, name: 'A', slug: 'a', score: 10, image_url: 'https://x', color: '#fff' }];
    const [standing] = buildCoalitionStandings(raw);
    expect(standing).toMatchObject({ imageUrl: 'https://x', color: '#fff' });
  });

  it('returns an empty array for empty input', () => {
    expect(buildCoalitionStandings([])).toEqual([]);
  });

  it('attaches topContributor from the provided map, defaulting to null when absent', () => {
    const raw: RawCoalition[] = [
      { id: 1, name: 'A', slug: 'a', score: 100 },
      { id: 2, name: 'B', slug: 'b', score: 50 },
    ];
    const topContributors = new Map([[1, { id: 9, login: 'top', displayName: 'Top Student', imageUrl: null, score: 500 }]]);

    const standings = buildCoalitionStandings(raw, topContributors);

    expect(standings.find((s) => s.id === 1)?.topContributor).toEqual({ id: 9, login: 'top', displayName: 'Top Student', imageUrl: null, score: 500 });
    expect(standings.find((s) => s.id === 2)?.topContributor).toBeNull();
  });

  it('attaches weeklyTopContributor from the provided map, defaulting to null when absent', () => {
    const raw: RawCoalition[] = [
      { id: 1, name: 'A', slug: 'a', score: 100 },
      { id: 2, name: 'B', slug: 'b', score: 50 },
    ];
    const weeklyTopContributors = new Map([[1, { id: 9, login: 'top', displayName: 'Top Student', imageUrl: null, weeklyPoints: 250 }]]);

    const standings = buildCoalitionStandings(raw, new Map(), weeklyTopContributors);

    expect(standings.find((s) => s.id === 1)?.weeklyTopContributor).toEqual({
      id: 9,
      login: 'top',
      displayName: 'Top Student',
      imageUrl: null,
      weeklyPoints: 250,
    });
    expect(standings.find((s) => s.id === 2)?.weeklyTopContributor).toBeNull();
  });

  it('attaches weeklyPoints from the provided map, defaulting to 0 when absent', () => {
    const raw: RawCoalition[] = [
      { id: 1, name: 'A', slug: 'a', score: 100 },
      { id: 2, name: 'B', slug: 'b', score: 50 },
    ];
    const weeklyPointsByCoalition = new Map([[1, 340]]);

    const standings = buildCoalitionStandings(raw, new Map(), new Map(), weeklyPointsByCoalition);

    expect(standings.find((s) => s.id === 1)?.weeklyPoints).toBe(340);
    expect(standings.find((s) => s.id === 2)?.weeklyPoints).toBe(0);
  });
});

describe('buildTopContributors', () => {
  it('picks the highest-scoring student per coalition, ignoring users not in the roster', () => {
    const students = new Map([
      [1, fakeStudent({ id: 1, login: 'low' })],
      [2, fakeStudent({ id: 2, login: 'high' })],
    ]);
    const coalitionUsers: RawCoalitionUser[] = [
      { id: 100, coalition_id: 459, user_id: 1, score: 50 },
      { id: 101, coalition_id: 459, user_id: 2, score: 500 },
      { id: 102, coalition_id: 459, user_id: 999, score: 999999 }, // not in roster - must be ignored
    ];

    const result = buildTopContributors(coalitionUsers, students);

    expect(result.get(459)).toEqual({ id: 2, login: 'high', displayName: 'Student 2', imageUrl: null, score: 500 });
  });

  it('handles negative scores correctly (still picks the least-negative/highest value)', () => {
    const students = new Map([
      [1, fakeStudent({ id: 1, login: 'a' })],
      [2, fakeStudent({ id: 2, login: 'b' })],
    ]);
    const coalitionUsers: RawCoalitionUser[] = [
      { id: 100, coalition_id: 459, user_id: 1, score: -1599 },
      { id: 101, coalition_id: 459, user_id: 2, score: -50 },
    ];

    const result = buildTopContributors(coalitionUsers, students);

    expect(result.get(459)?.login).toBe('b');
  });

  it('tracks separate top contributors per coalition_id', () => {
    const students = new Map([
      [1, fakeStudent({ id: 1, login: 'a' })],
      [2, fakeStudent({ id: 2, login: 'b' })],
    ]);
    const coalitionUsers: RawCoalitionUser[] = [
      { id: 100, coalition_id: 459, user_id: 1, score: 10 },
      { id: 101, coalition_id: 458, user_id: 2, score: 20 },
    ];

    const result = buildTopContributors(coalitionUsers, students);

    expect(result.get(459)?.login).toBe('a');
    expect(result.get(458)?.login).toBe('b');
  });

  it('returns an empty map for empty input', () => {
    expect(buildTopContributors([], new Map()).size).toBe(0);
  });
});

describe('buildWeeklyTopContributors', () => {
  it('picks the highest weekly-points student per coalition, ignoring users not in the roster', () => {
    const students = new Map([
      [1, fakeStudent({ id: 1, login: 'low' })],
      [2, fakeStudent({ id: 2, login: 'high' })],
    ]);
    const coalitionUsers: RawCoalitionUser[] = [
      { id: 100, coalition_id: 459, user_id: 1, score: 9999 }, // high all-time score, low weekly
      { id: 101, coalition_id: 459, user_id: 2, score: 10 },
      { id: 102, coalition_id: 459, user_id: 999, score: 999999 }, // not in roster - must be ignored
    ];
    const completions: ProjectCompletion[] = [
      fakeCompletion({ studentId: 1, finalMark: 20 }),
      fakeCompletion({ studentId: 2, finalMark: 90 }),
      fakeCompletion({ studentId: 999, finalMark: 100 }),
    ];

    const result = buildWeeklyTopContributors(coalitionUsers, students, completions, 7, NOW);

    expect(result.get(459)).toEqual({ id: 2, login: 'high', displayName: 'Student 2', imageUrl: null, weeklyPoints: 90 });
  });

  it('ignores completions outside the trailing window, even for the all-time top contributor', () => {
    const students = new Map([[1, fakeStudent({ id: 1, login: 'stale' })]]);
    const coalitionUsers: RawCoalitionUser[] = [{ id: 100, coalition_id: 459, user_id: 1, score: 5000 }];
    const staleDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const completions: ProjectCompletion[] = [fakeCompletion({ studentId: 1, finalMark: 100, completedAt: staleDate })];

    const result = buildWeeklyTopContributors(coalitionUsers, students, completions, 7, NOW);

    expect(result.has(459)).toBe(false);
  });

  it('ignores unvalidated completions and null final marks', () => {
    const students = new Map([[1, fakeStudent({ id: 1, login: 'a' })]]);
    const coalitionUsers: RawCoalitionUser[] = [{ id: 100, coalition_id: 459, user_id: 1, score: 10 }];
    const completions: ProjectCompletion[] = [
      fakeCompletion({ studentId: 1, validated: false, finalMark: 100 }),
      fakeCompletion({ studentId: 1, validated: true, finalMark: null }),
    ];

    const result = buildWeeklyTopContributors(coalitionUsers, students, completions, 7, NOW);

    expect(result.has(459)).toBe(false);
  });

  it('tracks separate weekly leaders per coalition_id', () => {
    const students = new Map([
      [1, fakeStudent({ id: 1, login: 'a' })],
      [2, fakeStudent({ id: 2, login: 'b' })],
    ]);
    const coalitionUsers: RawCoalitionUser[] = [
      { id: 100, coalition_id: 459, user_id: 1, score: 10 },
      { id: 101, coalition_id: 458, user_id: 2, score: 20 },
    ];
    const completions: ProjectCompletion[] = [
      fakeCompletion({ studentId: 1, finalMark: 40 }),
      fakeCompletion({ studentId: 2, finalMark: 60 }),
    ];

    const result = buildWeeklyTopContributors(coalitionUsers, students, completions, 7, NOW);

    expect(result.get(459)?.weeklyPoints).toBe(40);
    expect(result.get(458)?.weeklyPoints).toBe(60);
  });

  it('returns an empty map when nobody has validated completions in the window', () => {
    const students = new Map([[1, fakeStudent({ id: 1, login: 'a' })]]);
    const coalitionUsers: RawCoalitionUser[] = [{ id: 100, coalition_id: 459, user_id: 1, score: 10 }];

    const result = buildWeeklyTopContributors(coalitionUsers, students, [], 7, NOW);

    expect(result.size).toBe(0);
  });
});

describe('buildWeeklyPointsByCoalition', () => {
  it('sums weekly XP across every member of a coalition, not just the top one', () => {
    const students = new Map([
      [1, fakeStudent({ id: 1, login: 'a' })],
      [2, fakeStudent({ id: 2, login: 'b' })],
    ]);
    const coalitionUsers: RawCoalitionUser[] = [
      { id: 100, coalition_id: 459, user_id: 1, score: 10 },
      { id: 101, coalition_id: 459, user_id: 2, score: 20 },
    ];
    const completions: ProjectCompletion[] = [
      fakeCompletion({ studentId: 1, finalMark: 40 }),
      fakeCompletion({ studentId: 2, finalMark: 60 }),
    ];

    const result = buildWeeklyPointsByCoalition(coalitionUsers, students, completions, 7, NOW);

    expect(result.get(459)).toBe(100);
  });

  it('ignores users not in the campus roster', () => {
    const students = new Map([[1, fakeStudent({ id: 1, login: 'a' })]]);
    const coalitionUsers: RawCoalitionUser[] = [{ id: 100, coalition_id: 459, user_id: 999, score: 999999 }];
    const completions: ProjectCompletion[] = [fakeCompletion({ studentId: 999, finalMark: 100 })];

    const result = buildWeeklyPointsByCoalition(coalitionUsers, students, completions, 7, NOW);

    expect(result.has(459)).toBe(false);
  });

  it('ignores completions outside the trailing window', () => {
    const students = new Map([[1, fakeStudent({ id: 1, login: 'a' })]]);
    const coalitionUsers: RawCoalitionUser[] = [{ id: 100, coalition_id: 459, user_id: 1, score: 10 }];
    const staleDate = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const completions: ProjectCompletion[] = [fakeCompletion({ studentId: 1, finalMark: 100, completedAt: staleDate })];

    const result = buildWeeklyPointsByCoalition(coalitionUsers, students, completions, 7, NOW);

    expect(result.has(459)).toBe(false);
  });

  it('tracks separate totals per coalition_id', () => {
    const students = new Map([
      [1, fakeStudent({ id: 1, login: 'a' })],
      [2, fakeStudent({ id: 2, login: 'b' })],
    ]);
    const coalitionUsers: RawCoalitionUser[] = [
      { id: 100, coalition_id: 459, user_id: 1, score: 10 },
      { id: 101, coalition_id: 458, user_id: 2, score: 20 },
    ];
    const completions: ProjectCompletion[] = [
      fakeCompletion({ studentId: 1, finalMark: 40 }),
      fakeCompletion({ studentId: 2, finalMark: 60 }),
    ];

    const result = buildWeeklyPointsByCoalition(coalitionUsers, students, completions, 7, NOW);

    expect(result.get(459)).toBe(40);
    expect(result.get(458)).toBe(60);
  });

  it('returns an empty map for empty input', () => {
    expect(buildWeeklyPointsByCoalition([], new Map(), [], 7, NOW).size).toBe(0);
  });
});
