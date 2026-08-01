import { describe, expect, it } from 'vitest';
import { buildActiveNow, buildAchievementFeed, buildBlackHoleWatch, buildXpLeaderboard } from '../services/livePulse.js';
import type { ProjectCompletion, StudentSummary } from '../models/types.js';

function makeStudent(overrides: Partial<StudentSummary> = {}): StudentSummary {
  return {
    id: 1,
    login: 'jdoe',
    displayName: 'J Doe',
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

function makeCompletion(overrides: Partial<ProjectCompletion> = {}): ProjectCompletion {
  return {
    projectUserId: 1,
    studentId: 1,
    login: 'jdoe',
    displayName: 'J Doe',
    imageUrl: null,
    projectId: 10,
    projectName: 'Libft',
    finalMark: 90,
    validated: true,
    status: 'finished',
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildActiveNow', () => {
  it('excludes students with no active session and sorts by session length descending', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    const students = [
      makeStudent({ id: 1, activeSince: new Date(now.getTime() - 10 * 60_000).toISOString() }),
      makeStudent({ id: 2, activeSince: new Date(now.getTime() - 90 * 60_000).toISOString() }),
      makeStudent({ id: 3, activeSince: null }),
    ];
    const result = buildActiveNow(students, now, 10);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(2);
    expect(result[0]!.sessionMinutes).toBe(90);
  });

  it('respects the limit', () => {
    const now = new Date();
    const students = [1, 2, 3].map((id) => makeStudent({ id, activeSince: now.toISOString() }));
    expect(buildActiveNow(students, now, 2)).toHaveLength(2);
  });
});

describe('buildXpLeaderboard', () => {
  it('sums final marks per student within the window and sorts descending', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    const completions = [
      makeCompletion({ studentId: 1, finalMark: 80, completedAt: now.toISOString() }),
      makeCompletion({ studentId: 1, finalMark: 100, completedAt: now.toISOString() }),
      makeCompletion({ studentId: 2, finalMark: 60, completedAt: now.toISOString() }),
      makeCompletion({ studentId: 3, finalMark: 100, completedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString() }),
    ];
    const result = buildXpLeaderboard(completions, 7, now, 10);
    expect(result[0]!.id).toBe(1);
    expect(result[0]!.weeklyXp).toBe(180);
    expect(result.find((r) => r.id === 3)).toBeUndefined();
  });

  it('ignores unvalidated completions and null marks', () => {
    const now = new Date();
    const completions = [
      makeCompletion({ studentId: 1, validated: false, finalMark: 100, completedAt: now.toISOString() }),
      makeCompletion({ studentId: 2, validated: true, finalMark: null, completedAt: now.toISOString() }),
    ];
    expect(buildXpLeaderboard(completions, 7, now, 10)).toHaveLength(0);
  });
});

describe('buildBlackHoleWatch', () => {
  it('only includes future black hole dates, soonest first', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const students = [
      makeStudent({ id: 1, blackholedAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString() }),
      makeStudent({ id: 2, blackholedAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }),
      makeStudent({ id: 3, blackholedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString() }),
      makeStudent({ id: 4, blackholedAt: null }),
    ];
    const result = buildBlackHoleWatch(students, now, 10);
    expect(result.map((r) => r.id)).toEqual([2, 1]);
    expect(result[0]!.daysRemaining).toBe(2);
  });
});

describe('buildAchievementFeed', () => {
  it('flags isTakeover only when the final mark is at or above the threshold', () => {
    const now = new Date();
    const completions = [
      makeCompletion({ projectUserId: 1, finalMark: 100, completedAt: now.toISOString() }),
      makeCompletion({ projectUserId: 2, finalMark: 90, completedAt: now.toISOString() }),
    ];
    const result = buildAchievementFeed(completions, 3, now, 10);
    expect(result.find((a) => a.projectUserId === 1)?.isTakeover).toBe(true);
    expect(result.find((a) => a.projectUserId === 2)?.isTakeover).toBe(false);
  });

  it('excludes unvalidated and out-of-window completions, newest first', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const completions = [
      makeCompletion({ projectUserId: 1, completedAt: now.toISOString(), validated: true }),
      makeCompletion({ projectUserId: 2, completedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), validated: true }),
      makeCompletion({ projectUserId: 3, completedAt: now.toISOString(), validated: false }),
    ];
    const result = buildAchievementFeed(completions, 3, now, 10);
    expect(result.map((a) => a.projectUserId)).toEqual([1]);
  });
});
