import { describe, expect, it } from 'vitest';
import { buildCoalitionStandings, buildTopContributors } from '../services/coalitions.js';
import type { RawCoalition, RawCoalitionUser, StudentSummary } from '../models/types.js';

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
