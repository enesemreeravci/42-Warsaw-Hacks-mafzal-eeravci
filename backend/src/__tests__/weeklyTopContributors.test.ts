import { describe, expect, it } from 'vitest';
import { buildWeeklyContributorLeaderboard, type ContributorCoalitionRef } from '../services/weeklyTopContributors.js';
import type { CoalitionScoreSnapshot } from '../services/coalitionSnapshotStore.js';
import type { StudentSummary } from '../models/types.js';

const NOW = new Date('2026-07-31T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const CAMPUS_ID = 67;
const CURSUS_ID = 21;

function fakeStudent(overrides: Partial<StudentSummary> & { id: number; login: string }): StudentSummary {
  return {
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

function snapshot(takenAt: Date, scores: Record<string, number>): CoalitionScoreSnapshot {
  return { takenAt: takenAt.toISOString(), scores };
}

const studentsById = new Map([
  [1, fakeStudent({ id: 1, login: 'eeravci', level: 9.42 })],
  [2, fakeStudent({ id: 2, login: 'other', level: 4 })],
]);
const coalitionByUserId = new Map<number, ContributorCoalitionRef>([[1, { id: 100, name: 'Freax', color: '#fff' }]]);

describe('buildWeeklyContributorLeaderboard', () => {
  it('reports unavailable when there are no snapshots at all', () => {
    const result = buildWeeklyContributorLeaderboard({
      snapshots: [],
      studentsById,
      coalitionByUserId,
      periodDays: 7,
      now: NOW,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
    });

    expect(result.available).toBe(false);
    expect(result.message).toMatch(/not available yet/);
    expect(result.contributors).toEqual([]);
  });

  it('reports unavailable when the only snapshot is too recent to cover the period (no real baseline)', () => {
    const snapshots = [snapshot(NOW, { '1': 1540 })];
    const result = buildWeeklyContributorLeaderboard({
      snapshots,
      studentsById,
      coalitionByUserId,
      periodDays: 7,
      now: NOW,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
    });

    expect(result.available).toBe(false);
  });

  it('computes pointsEarned as current minus baseline score, never from current totals alone', () => {
    const snapshots = [
      snapshot(new Date(NOW.getTime() - 7 * DAY_MS), { '1': 1295 }),
      snapshot(NOW, { '1': 1540 }),
    ];

    const result = buildWeeklyContributorLeaderboard({
      snapshots,
      studentsById,
      coalitionByUserId,
      periodDays: 7,
      now: NOW,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
    });

    expect(result.available).toBe(true);
    expect(result.contributors).toHaveLength(1);
    expect(result.contributors[0]).toMatchObject({
      rank: 1,
      login: 'eeravci',
      pointsEarned: 245,
      coalition: { id: 100, name: 'Freax', color: '#fff' },
    });
  });

  it('excludes a student with zero or negative point change', () => {
    const snapshots = [
      snapshot(new Date(NOW.getTime() - 7 * DAY_MS), { '1': 1540, '2': 500 }),
      snapshot(NOW, { '1': 1540, '2': 480 }),
    ];

    const result = buildWeeklyContributorLeaderboard({
      snapshots,
      studentsById,
      coalitionByUserId,
      periodDays: 7,
      now: NOW,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
    });

    expect(result.contributors).toEqual([]);
  });

  it('excludes a student with no baseline score (not present in the baseline snapshot)', () => {
    const snapshots = [
      snapshot(new Date(NOW.getTime() - 7 * DAY_MS), { '1': 1295 }),
      snapshot(NOW, { '1': 1540, '2': 900 }), // user 2 has no baseline entry
    ];

    const result = buildWeeklyContributorLeaderboard({
      snapshots,
      studentsById,
      coalitionByUserId,
      periodDays: 7,
      now: NOW,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
    });

    expect(result.contributors.map((c) => c.userId)).toEqual([1]);
  });

  it('excludes a user id no longer in the current roster', () => {
    const snapshots = [
      snapshot(new Date(NOW.getTime() - 7 * DAY_MS), { '999': 100 }),
      snapshot(NOW, { '999': 500 }),
    ];

    const result = buildWeeklyContributorLeaderboard({
      snapshots,
      studentsById,
      coalitionByUserId,
      periodDays: 7,
      now: NOW,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
    });

    expect(result.contributors).toEqual([]);
  });

  it('ranks descending by pointsEarned and computes rank/summary correctly', () => {
    const twoCoalitionUsers = new Map<number, ContributorCoalitionRef>([
      [1, { id: 100, name: 'Freax', color: '#f00' }],
      [2, { id: 200, name: 'Alliance', color: '#00f' }],
    ]);
    const snapshots = [
      snapshot(new Date(NOW.getTime() - 7 * DAY_MS), { '1': 1000, '2': 1000 }),
      snapshot(NOW, { '1': 1300, '2': 1050 }),
    ];

    const result = buildWeeklyContributorLeaderboard({
      snapshots,
      studentsById,
      coalitionByUserId: twoCoalitionUsers,
      periodDays: 7,
      now: NOW,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
    });

    expect(result.contributors.map((c) => c.login)).toEqual(['eeravci', 'other']);
    expect(result.summary.topContributor).toEqual({ login: 'eeravci', displayName: 'Student 1', pointsEarned: 300 });
    expect(result.summary.totalPointsEarned).toBe(350);
    expect(result.summary.activeContributors).toBe(2);
    expect(result.coalitionComparison).toEqual([
      { coalitionId: 100, name: 'Freax', color: '#f00', pointsGained: 300 },
      { coalitionId: 200, name: 'Alliance', color: '#00f', pointsGained: 50 },
    ]);
    expect(result.summary.mostActiveCoalition).toEqual({ name: 'Freax', pointsGained: 300 });
  });

  it('computes rankChange when a third data point (two periods back) is available', () => {
    const snapshots = [
      snapshot(new Date(NOW.getTime() - 14 * DAY_MS), { '1': 1000, '2': 1000 }),
      snapshot(new Date(NOW.getTime() - 7 * DAY_MS), { '1': 1050, '2': 1300 }), // last week: user2 led
      snapshot(NOW, { '1': 1400, '2': 1350 }), // this week: user1 leads
    ];

    const result = buildWeeklyContributorLeaderboard({
      snapshots,
      studentsById,
      coalitionByUserId,
      periodDays: 7,
      now: NOW,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
    });

    const eeravci = result.contributors.find((c) => c.login === 'eeravci')!;
    // eeravci: this week rank 1, last week rank 2 (350 vs 50) -> moved up 1.
    expect(eeravci.rank).toBe(1);
    expect(eeravci.previousRank).toBe(2);
    expect(eeravci.rankChange).toBe(1);
  });

  it('never fabricates rankChange when there is no data two periods back', () => {
    const snapshots = [
      snapshot(new Date(NOW.getTime() - 7 * DAY_MS), { '1': 1295 }),
      snapshot(NOW, { '1': 1540 }),
    ];

    const result = buildWeeklyContributorLeaderboard({
      snapshots,
      studentsById,
      coalitionByUserId,
      periodDays: 7,
      now: NOW,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
    });

    expect(result.contributors[0]!.previousRank).toBeNull();
    expect(result.contributors[0]!.rankChange).toBeNull();
  });
});
