import { describe, expect, it } from 'vitest';
import {
  averageLevel,
  buildCompletionTrend,
  buildDashboardSummary,
  buildProjectMetrics,
  countCompletionsSince,
  topProjectsByCompletions,
  topStudentsByCompletedProjects,
  topStudentsByLevel,
} from '../services/metrics.js';
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
    finalMark: 100,
    validated: true,
    status: 'finished',
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('averageLevel', () => {
  it('averages only active students', () => {
    const students = [makeStudent({ level: 4, active: true }), makeStudent({ level: 6, active: true }), makeStudent({ level: 100, active: false })];
    expect(averageLevel(students)).toBe(5);
  });

  it('returns 0 instead of NaN when there are no active students', () => {
    expect(averageLevel([makeStudent({ active: false })])).toBe(0);
    expect(averageLevel([])).toBe(0);
  });
});

describe('countCompletionsSince', () => {
  it('only counts validated completions on or after the cutoff', () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const completions = [
      makeCompletion({ completedAt: yesterday.toISOString(), validated: true }),
      makeCompletion({ completedAt: lastWeek.toISOString(), validated: true }),
      makeCompletion({ completedAt: yesterday.toISOString(), validated: false }),
    ];
    const since = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    expect(countCompletionsSince(completions, since)).toBe(1);
  });
});

describe('buildDashboardSummary', () => {
  it('aggregates students and completions into a summary', () => {
    const now = new Date();
    const students = [makeStudent({ active: true, level: 4 }), makeStudent({ id: 2, active: false, level: 8 })];
    const completions = [makeCompletion({ completedAt: now.toISOString(), validated: true })];
    const summary = buildDashboardSummary(students, completions, now, 'fresh');
    expect(summary.totalStudents).toBe(2);
    expect(summary.activeStudents).toBe(1);
    expect(summary.totalValidatedCompletions).toBe(1);
    expect(summary.cacheStatus).toBe('fresh');
  });
});

describe('buildCompletionTrend', () => {
  it('produces one bucket per day covering the requested range', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    const trend = buildCompletionTrend([], 5, now);
    expect(trend).toHaveLength(5);
    expect(trend[trend.length - 1]!.date).toBe('2026-01-10');
  });

  it('buckets validated completions by calendar day', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    const completions = [
      makeCompletion({ completedAt: '2026-01-10T08:00:00Z', validated: true }),
      makeCompletion({ completedAt: '2026-01-09T08:00:00Z', validated: true }),
      makeCompletion({ completedAt: '2026-01-09T09:00:00Z', validated: false }),
    ];
    const trend = buildCompletionTrend(completions, 5, now);
    const jan10 = trend.find((p) => p.date === '2026-01-10');
    const jan9 = trend.find((p) => p.date === '2026-01-09');
    expect(jan10?.count).toBe(1);
    expect(jan9?.count).toBe(1);
  });
});

describe('buildProjectMetrics', () => {
  it('computes success rate and average final mark per project', () => {
    const completions = [
      makeCompletion({ projectId: 1, projectName: 'Libft', finalMark: 100, validated: true, status: 'finished' }),
      makeCompletion({ projectId: 1, projectName: 'Libft', finalMark: 40, validated: false, status: 'finished' }),
    ];
    const [metric] = buildProjectMetrics(completions);
    expect(metric!.completionCount).toBe(2);
    expect(metric!.successfulCompletionCount).toBe(1);
    expect(metric!.successRate).toBe(50);
    expect(metric!.averageFinalMark).toBe(70);
  });
});

describe('top rankings', () => {
  it('sorts projects by completion count descending', () => {
    const metrics = [
      { projectId: 1, projectName: 'A', completionCount: 2, successfulCompletionCount: 2, failedCompletionCount: 0, averageFinalMark: 100, successRate: 100 },
      { projectId: 2, projectName: 'B', completionCount: 5, successfulCompletionCount: 5, failedCompletionCount: 0, averageFinalMark: 100, successRate: 100 },
    ];
    expect(topProjectsByCompletions(metrics, 1)[0]!.projectId).toBe(2);
  });

  it('sorts students by level and by completed project count', () => {
    const students = [makeStudent({ id: 1, level: 3, completedProjectCount: 9 }), makeStudent({ id: 2, level: 8, completedProjectCount: 1 })];
    expect(topStudentsByLevel(students, 1)[0]!.id).toBe(2);
    expect(topStudentsByCompletedProjects(students, 1)[0]!.id).toBe(1);
  });
});
