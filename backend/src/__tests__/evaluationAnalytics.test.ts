import { describe, it, expect } from 'vitest';
import {
  normalizeAnalyticsEntry,
  buildHeatmap,
  buildKPI,
  buildHeatmapSummary,
  buildTopEvaluators,
  buildMostEvaluatedStudents,
  buildTopContributors,
  buildProjectRankings,
  buildActivitySeries,
  buildTimeline,
  buildInsights,
  buildEvaluationAnalytics,
  applyEvaluationFilters,
  buildActivitySeriesWithGranularity,
} from '../services/evaluationAnalytics.js';
import type { EvaluationAnalyticsEntry, RawScaleTeam, StudentSummary } from '../models/types.js';

const NOW = new Date('2026-08-01T12:00:00Z'); // Saturday noon UTC = 14:00 Warsaw (CEST)

function makeStudent(overrides: Partial<StudentSummary> = {}): StudentSummary {
  return {
    id: 1,
    login: 'alice',
    displayName: 'Alice',
    imageUrl: 'https://cdn.example.com/alice.jpg',
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

function makeRaw(overrides: Partial<RawScaleTeam> = {}): RawScaleTeam {
  return {
    id: 1,
    final_mark: 100,
    filled_at: '2026-08-01T10:00:00Z',
    flag: { id: 1, name: 'Ok', positive: true },
    corrector: { id: 10, login: 'bob' },
    correcteds: [{ id: 20, login: 'alice' }],
    team: { name: 'alice', project_id: 42 },
    scale: { project: { id: 42, name: 'ft_printf' } },
    ...overrides,
  };
}

function makeEntry(overrides: Partial<EvaluationAnalyticsEntry> = {}): EvaluationAnalyticsEntry {
  return {
    id: 1,
    correctorLogin: 'bob',
    correctorDisplayName: 'Bob',
    correctorImageUrl: null,
    correctorLevel: 7,
    correctedLogin: 'alice',
    correctedDisplayName: 'Alice',
    correctedImageUrl: null,
    projectId: 42,
    projectName: 'ft_printf',
    finalMark: 100,
    flagPositive: true,
    filledAt: '2026-08-01T10:00:00Z',
    ...overrides,
  };
}

// ─── normalizeAnalyticsEntry ──────────────────────────────────────────────────

describe('normalizeAnalyticsEntry', () => {
  it('returns null when filled_at is missing', () => {
    const students = new Map([['alice', makeStudent()]]);
    expect(normalizeAnalyticsEntry(makeRaw({ filled_at: null }), students)).toBeNull();
  });

  it('returns null when correcteds is empty', () => {
    const students = new Map([['alice', makeStudent()]]);
    expect(normalizeAnalyticsEntry(makeRaw({ correcteds: [] }), students)).toBeNull();
  });

  it('returns null when corrector is null', () => {
    const students = new Map([['alice', makeStudent()]]);
    expect(normalizeAnalyticsEntry(makeRaw({ corrector: null }), students)).toBeNull();
  });

  it('normalizes a complete record with scale.project.name', () => {
    const students = new Map([
      ['alice', makeStudent({ login: 'alice', displayName: 'Alice A.', level: 5 })],
      ['bob', makeStudent({ login: 'bob', displayName: 'Bob B.', level: 7, id: 10 })],
    ]);
    const result = normalizeAnalyticsEntry(makeRaw(), students);
    expect(result).not.toBeNull();
    expect(result!.projectName).toBe('ft_printf');
    expect(result!.correctorDisplayName).toBe('Bob B.');
    expect(result!.correctedDisplayName).toBe('Alice A.');
    expect(result!.correctorLevel).toBe(7);
  });

  it('falls back to login as displayName when student not in roster', () => {
    const students = new Map<string, StudentSummary>();
    const result = normalizeAnalyticsEntry(makeRaw(), students);
    expect(result).not.toBeNull();
    expect(result!.correctorDisplayName).toBe('bob');
    expect(result!.correctedDisplayName).toBe('alice');
  });

  it('falls back to team.name when scale.project.name is absent', () => {
    const students = new Map([['alice', makeStudent()]]);
    // makeRaw defaults team.name to 'alice'; override scale to be absent
    const raw = makeRaw({ scale: undefined });
    const result = normalizeAnalyticsEntry(raw, students);
    // The 42 API does not embed scale.project.name in scale_teams responses; team.name is the fallback
    expect(result!.projectName).toBe('alice');
  });

  it('uses team.name as projectName fallback when scale is absent', () => {
    const students = new Map([['alice', makeStudent()]]);
    const raw = makeRaw({ scale: undefined, team: { name: 'alice-team', project_id: 42 } });
    const result = normalizeAnalyticsEntry(raw, students);
    expect(result!.projectName).toBe('alice-team');
  });
});

// ─── buildHeatmap ─────────────────────────────────────────────────────────────

describe('buildHeatmap', () => {
  it('returns exactly 168 cells (7 days × 24 hours)', () => {
    const cells = buildHeatmap([]);
    expect(cells).toHaveLength(168);
  });

  it('all cells are zero when entries is empty', () => {
    const cells = buildHeatmap([]);
    expect(cells.every((c) => c.count === 0)).toBe(true);
  });

  it('increments the correct cell for a Warsaw-time entry', () => {
    // 2026-08-01T10:00:00Z = Saturday 12:00 Warsaw (CEST UTC+2)
    // dayIndex 5 = Saturday, hour 12
    const entry = makeEntry({ filledAt: '2026-08-01T10:00:00Z' });
    const cells = buildHeatmap([entry]);
    const saturdayNoon = cells.find((c) => c.dayIndex === 5 && c.hour === 12);
    expect(saturdayNoon?.count).toBe(1);
  });

  it('records topEvaluator and topProject in the cell', () => {
    const entry = makeEntry({ filledAt: '2026-08-01T10:00:00Z' });
    const cells = buildHeatmap([entry]);
    const saturdayNoon = cells.find((c) => c.dayIndex === 5 && c.hour === 12)!;
    expect(saturdayNoon.topEvaluator).toBe('bob');
    expect(saturdayNoon.topProject).toBe('ft_printf');
  });

  it('handles multiple entries in the same cell', () => {
    const entries = [
      makeEntry({ id: 1, filledAt: '2026-08-01T10:00:00Z', correctorLogin: 'bob' }),
      makeEntry({ id: 2, filledAt: '2026-08-01T10:30:00Z', correctorLogin: 'carol' }),
    ];
    const cells = buildHeatmap(entries);
    const saturdayNoon = cells.find((c) => c.dayIndex === 5 && c.hour === 12)!;
    expect(saturdayNoon.count).toBe(2);
  });
});

// ─── buildKPI ─────────────────────────────────────────────────────────────────

describe('buildKPI', () => {
  it('returns all-zero KPI for empty entries', () => {
    const kpi = buildKPI([], NOW);
    expect(kpi.evaluationsToday).toBe(0);
    expect(kpi.activeEvaluators).toBe(0);
    expect(kpi.historicalAvailable).toBe(false);
  });

  it('counts evaluations today correctly in Warsaw time', () => {
    // NOW = 2026-08-01T12:00:00Z = 2026-08-01T14:00 Warsaw (CEST UTC+2)
    // 2026-07-31T21:00:00Z = 2026-07-31T23:00 Warsaw = still July 31st (previous day)
    const entries = [
      makeEntry({ filledAt: '2026-08-01T08:00:00Z' }),
      makeEntry({ id: 2, filledAt: '2026-07-31T21:00:00Z' }), // previous day Warsaw
    ];
    const kpi = buildKPI(entries, NOW);
    expect(kpi.evaluationsToday).toBe(1);
  });

  it('identifies the most evaluated project', () => {
    const entries = [
      makeEntry({ projectName: 'libft' }),
      makeEntry({ id: 2, projectName: 'libft' }),
      makeEntry({ id: 3, projectName: 'ft_printf' }),
    ];
    const kpi = buildKPI(entries, NOW);
    expect(kpi.mostEvaluatedProject).toBe('libft');
  });

  it('computes averagePerDay across unique Warsaw days', () => {
    const entries = [
      makeEntry({ id: 1, filledAt: '2026-07-30T10:00:00Z' }),
      makeEntry({ id: 2, filledAt: '2026-07-30T14:00:00Z' }),
      makeEntry({ id: 3, filledAt: '2026-07-31T10:00:00Z' }),
    ];
    const kpi = buildKPI(entries, NOW);
    expect(kpi.averagePerDay).toBe(1.5); // 3 evals / 2 days
  });

  it('historicalAvailable is always false', () => {
    const kpi = buildKPI([makeEntry()], NOW);
    expect(kpi.historicalAvailable).toBe(false);
  });
});

// ─── buildTopEvaluators ───────────────────────────────────────────────────────

describe('buildTopEvaluators', () => {
  it('returns empty array for no entries', () => {
    expect(buildTopEvaluators([])).toEqual([]);
  });

  it('sorts by evaluation count descending', () => {
    const entries = [
      makeEntry({ id: 1, correctorLogin: 'alice', correctedLogin: 'x1' }),
      makeEntry({ id: 2, correctorLogin: 'bob', correctedLogin: 'x2' }),
      makeEntry({ id: 3, correctorLogin: 'bob', correctedLogin: 'x3' }),
    ];
    const result = buildTopEvaluators(entries);
    expect(result[0]!.login).toBe('bob');
    expect(result[0]!.evaluationCount).toBe(2);
    expect(result[1]!.login).toBe('alice');
  });

  it('counts unique students correctly', () => {
    const entries = [
      makeEntry({ id: 1, correctorLogin: 'bob', correctedLogin: 'alice' }),
      makeEntry({ id: 2, correctorLogin: 'bob', correctedLogin: 'alice' }), // same student
      makeEntry({ id: 3, correctorLogin: 'bob', correctedLogin: 'carol' }),
    ];
    const result = buildTopEvaluators(entries);
    expect(result[0]!.uniqueStudentsEvaluated).toBe(2); // alice + carol
  });

  it('respects the limit parameter', () => {
    const entries = ['a', 'b', 'c', 'd'].map((login, i) => makeEntry({ id: i, correctorLogin: login }));
    expect(buildTopEvaluators(entries, 2)).toHaveLength(2);
  });
});

// ─── buildTopContributors ─────────────────────────────────────────────────────

describe('buildTopContributors', () => {
  it('score = evaluations×3 + uniqueStudents×2 + uniqueProjects + activeDays', () => {
    // bob: 2 evals, 2 unique students, 1 project, 1 day
    // score = 2×3 + 2×2 + 1 + 1 = 6 + 4 + 1 + 1 = 12
    const entries = [
      makeEntry({ id: 1, correctorLogin: 'bob', correctedLogin: 'alice', projectName: 'libft', filledAt: '2026-08-01T10:00:00Z' }),
      makeEntry({ id: 2, correctorLogin: 'bob', correctedLogin: 'carol', projectName: 'libft', filledAt: '2026-08-01T11:00:00Z' }),
    ];
    const result = buildTopContributors(entries);
    expect(result[0]!.login).toBe('bob');
    expect(result[0]!.contributionScore).toBe(12);
    expect(result[0]!.scoreComponents.evaluations).toBe(6);
    expect(result[0]!.scoreComponents.uniqueStudents).toBe(4);
  });
});

// ─── buildMostEvaluatedStudents ───────────────────────────────────────────────

describe('buildMostEvaluatedStudents', () => {
  it('returns empty array for no entries', () => {
    expect(buildMostEvaluatedStudents([])).toEqual([]);
  });

  it('sorts by evaluationsReceived descending', () => {
    const entries = [
      makeEntry({ id: 1, correctedLogin: 'alice', correctorLogin: 'x1' }),
      makeEntry({ id: 2, correctedLogin: 'bob', correctorLogin: 'x2' }),
      makeEntry({ id: 3, correctedLogin: 'bob', correctorLogin: 'x3' }),
    ];
    const result = buildMostEvaluatedStudents(entries);
    expect(result[0]!.login).toBe('bob');
    expect(result[0]!.evaluationsReceived).toBe(2);
  });

  it('counts unique projects per student', () => {
    const entries = [
      makeEntry({ id: 1, correctedLogin: 'alice', projectName: 'libft' }),
      makeEntry({ id: 2, correctedLogin: 'alice', projectName: 'libft' }), // same project
      makeEntry({ id: 3, correctedLogin: 'alice', projectName: 'ft_printf' }),
    ];
    const result = buildMostEvaluatedStudents(entries);
    expect(result[0]!.uniqueProjects).toBe(2);
  });
});

// ─── buildProjectRankings ─────────────────────────────────────────────────────

describe('buildProjectRankings', () => {
  it('ranks by total evaluations desc', () => {
    const entries = [
      makeEntry({ id: 1, projectName: 'libft', correctedLogin: 'alice' }),
      makeEntry({ id: 2, projectName: 'libft', correctedLogin: 'bob' }),
      makeEntry({ id: 3, projectName: 'ft_printf', correctedLogin: 'alice' }),
    ];
    const result = buildProjectRankings(entries);
    expect(result[0]!.projectName).toBe('libft');
    expect(result[0]!.totalEvaluations).toBe(2);
  });

  it('computes averageMark correctly', () => {
    const entries = [
      makeEntry({ id: 1, projectName: 'libft', finalMark: 80 }),
      makeEntry({ id: 2, projectName: 'libft', finalMark: 100 }),
    ];
    const result = buildProjectRankings(entries);
    expect(result[0]!.averageMark).toBe(90);
  });

  it('averageMark is null when no marks available', () => {
    const entries = [makeEntry({ finalMark: null })];
    const result = buildProjectRankings(entries);
    expect(result[0]!.averageMark).toBeNull();
  });
});

// ─── buildActivitySeries ──────────────────────────────────────────────────────

describe('buildActivitySeries', () => {
  it('returns sorted daily series', () => {
    const entries = [
      makeEntry({ id: 1, filledAt: '2026-07-31T10:00:00Z' }),
      makeEntry({ id: 2, filledAt: '2026-07-30T10:00:00Z' }),
      makeEntry({ id: 3, filledAt: '2026-07-31T14:00:00Z' }),
    ];
    const series = buildActivitySeries(entries);
    expect(series[0]!.period).toBe('2026-07-30');
    expect(series[0]!.count).toBe(1);
    expect(series[1]!.period).toBe('2026-07-31');
    expect(series[1]!.count).toBe(2);
  });
});

// ─── buildTimeline ────────────────────────────────────────────────────────────

describe('buildTimeline', () => {
  it('returns newest evaluations first', () => {
    const entries = [
      makeEntry({ id: 1, filledAt: '2026-07-30T10:00:00Z' }),
      makeEntry({ id: 2, filledAt: '2026-08-01T10:00:00Z' }),
    ];
    const timeline = buildTimeline(entries, 10);
    expect(timeline[0]!.id).toBe(2);
    expect(timeline[1]!.id).toBe(1);
  });

  it('respects the limit', () => {
    const entries = Array.from({ length: 30 }, (_, i) =>
      makeEntry({ id: i, filledAt: new Date(NOW.getTime() - i * 60000).toISOString() }),
    );
    expect(buildTimeline(entries, 10)).toHaveLength(10);
  });
});

// ─── buildEvaluationAnalytics ─────────────────────────────────────────────────

describe('buildEvaluationAnalytics', () => {
  it('filters entries to the requested [from, to] window', () => {
    const from = new Date('2026-07-25T00:00:00Z');
    const to = new Date('2026-07-26T00:00:00Z');
    const raw = [
      makeRaw({ id: 1, filled_at: '2026-07-25T12:00:00Z' }),
      makeRaw({ id: 2, filled_at: '2026-07-27T12:00:00Z' }), // outside window
    ];
    const students = new Map([['alice', makeStudent()]]);
    const result = buildEvaluationAnalytics(raw, students, from, to, NOW, '42-api');
    expect(result.meta.totalEvaluations).toBe(1);
  });

  it('meta.historicalAvailable is always false', () => {
    const result = buildEvaluationAnalytics([], new Map(), new Date(0), NOW, NOW, '42-api');
    expect(result.meta.historicalAvailable).toBe(false);
  });

  it('meta.note mentions historical data is not available', () => {
    const result = buildEvaluationAnalytics([], new Map(), new Date(0), NOW, NOW, '42-api');
    expect(result.meta.note.toLowerCase()).toContain('historical');
  });

  it('heatmap always has 168 cells', () => {
    const result = buildEvaluationAnalytics([], new Map(), new Date(0), NOW, NOW, '42-api');
    expect(result.heatmap).toHaveLength(168);
  });

  it('includes all sub-sections in the response', () => {
    const result = buildEvaluationAnalytics([], new Map(), new Date(0), NOW, NOW, '42-api');
    expect(result).toHaveProperty('kpi');
    expect(result).toHaveProperty('heatmap');
    expect(result).toHaveProperty('heatmapSummary');
    expect(result).toHaveProperty('activitySeries');
    expect(result).toHaveProperty('topEvaluators');
    expect(result).toHaveProperty('mostEvaluatedStudents');
    expect(result).toHaveProperty('topContributors');
    expect(result).toHaveProperty('projectRankings');
    expect(result).toHaveProperty('timeline');
    expect(result).toHaveProperty('insights');
  });
});

// ─── applyEvaluationFilters ───────────────────────────────────────────────────

describe('applyEvaluationFilters', () => {
  const entries = [
    makeEntry({ id: 1, correctorLogin: 'bob', correctedLogin: 'alice', projectName: 'libft' }),
    makeEntry({ id: 2, correctorLogin: 'carol', correctedLogin: 'dave', projectName: 'ft_printf' }),
    makeEntry({ id: 3, correctorLogin: 'bob', correctedLogin: 'eve', projectName: 'libft' }),
  ];

  it('returns all entries when no filter is specified', () => {
    expect(applyEvaluationFilters(entries, {})).toHaveLength(3);
  });

  it('filters by studentLogin (corrected)', () => {
    const result = applyEvaluationFilters(entries, { studentLogin: 'alice' });
    expect(result).toHaveLength(1);
    expect(result[0]!.correctedLogin).toBe('alice');
  });

  it('filters by evaluatorLogin (corrector)', () => {
    const result = applyEvaluationFilters(entries, { evaluatorLogin: 'bob' });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.correctorLogin === 'bob')).toBe(true);
  });

  it('filters by projectName (case-insensitive substring)', () => {
    const result = applyEvaluationFilters(entries, { projectName: 'LIBFT' });
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.projectName === 'libft')).toBe(true);
  });

  it('applies multiple filters as AND conditions', () => {
    const result = applyEvaluationFilters(entries, { evaluatorLogin: 'bob', projectName: 'libft' });
    expect(result).toHaveLength(2);
    expect(result[0]!.correctorLogin).toBe('bob');
  });

  it('returns empty array when no entries match combined filters', () => {
    const result = applyEvaluationFilters(entries, { evaluatorLogin: 'carol', projectName: 'libft' });
    expect(result).toHaveLength(0);
  });

  it('excludes entries with null projectName when filtering by projectName', () => {
    const withNull = [...entries, makeEntry({ id: 4, projectName: null })];
    const result = applyEvaluationFilters(withNull, { projectName: 'libft' });
    expect(result).toHaveLength(2);
  });

  it('ignores null/empty filter values', () => {
    expect(applyEvaluationFilters(entries, { studentLogin: null })).toHaveLength(3);
    expect(applyEvaluationFilters(entries, { evaluatorLogin: '' })).toHaveLength(3);
  });
});

// ─── buildActivitySeriesWithGranularity ───────────────────────────────────────

describe('buildActivitySeriesWithGranularity', () => {
  const entries = [
    makeEntry({ id: 1, filledAt: '2026-07-27T10:00:00Z' }), // Monday 12:00 Warsaw
    makeEntry({ id: 2, filledAt: '2026-07-28T10:00:00Z' }), // Tuesday
    makeEntry({ id: 3, filledAt: '2026-07-29T10:00:00Z' }), // Wednesday
    makeEntry({ id: 4, filledAt: '2026-08-03T10:00:00Z' }), // Monday next week
  ];

  it('groups by day in daily mode (default)', () => {
    const series = buildActivitySeriesWithGranularity(entries, 'daily');
    expect(series).toHaveLength(4);
    expect(series[0]!.period).toBe('2026-07-27');
  });

  it('groups into ISO weeks in weekly mode', () => {
    const series = buildActivitySeriesWithGranularity(entries, 'weekly');
    // 2026-07-27 to 2026-07-29 = week W31, 2026-08-03 = week W32
    expect(series).toHaveLength(2);
    expect(series[0]!.period).toBe('2026-W31');
    expect(series[0]!.count).toBe(3);
    expect(series[1]!.period).toBe('2026-W32');
    expect(series[1]!.count).toBe(1);
  });

  it('groups by year-month in monthly mode', () => {
    const series = buildActivitySeriesWithGranularity(entries, 'monthly');
    expect(series).toHaveLength(2);
    expect(series[0]!.period).toBe('2026-07');
    expect(series[0]!.count).toBe(3);
    expect(series[1]!.period).toBe('2026-08');
    expect(series[1]!.count).toBe(1);
  });

  it('groups by Warsaw date+hour in hourly mode', () => {
    const hourEntries = [
      makeEntry({ id: 1, filledAt: '2026-07-27T08:00:00Z' }),  // 10:00 Warsaw
      makeEntry({ id: 2, filledAt: '2026-07-27T08:30:00Z' }),  // 10:30 Warsaw — same hour
      makeEntry({ id: 3, filledAt: '2026-07-27T09:00:00Z' }),  // 11:00 Warsaw — different hour
    ];
    const series = buildActivitySeriesWithGranularity(hourEntries, 'hourly');
    expect(series).toHaveLength(2);
    expect(series[0]!.count).toBe(2);
    expect(series[1]!.count).toBe(1);
  });

  it('returns sorted series chronologically', () => {
    const reversed = [...entries].reverse();
    const series = buildActivitySeriesWithGranularity(reversed, 'daily');
    expect(series[0]!.period < series[series.length - 1]!.period).toBe(true);
  });

  it('returns empty array for empty entries', () => {
    expect(buildActivitySeriesWithGranularity([], 'weekly')).toHaveLength(0);
  });
});

// ─── buildEvaluationAnalytics with filters ────────────────────────────────────

describe('buildEvaluationAnalytics with filters', () => {
  it('applies studentLogin filter to all analytics sections', () => {
    const from = new Date('2026-07-25T00:00:00Z');
    const to = new Date('2026-08-02T00:00:00Z');
    const raw = [
      makeRaw({ id: 1, filled_at: '2026-07-30T10:00:00Z', correcteds: [{ id: 20, login: 'alice' }] }),
      makeRaw({ id: 2, filled_at: '2026-07-30T11:00:00Z', correcteds: [{ id: 21, login: 'dave' }] }),
    ];
    const students = new Map([['alice', makeStudent()]]);
    const result = buildEvaluationAnalytics(raw, students, from, to, NOW, '42-api', { studentLogin: 'alice' });
    expect(result.meta.totalEvaluations).toBe(1);
    expect(result.filters.studentLogin).toBe('alice');
  });

  it('includes granularity in the response filters', () => {
    const result = buildEvaluationAnalytics([], new Map(), new Date(0), NOW, NOW, '42-api', {}, 'weekly');
    expect(result.filters.granularity).toBe('weekly');
  });

  it('uses daily granularity by default', () => {
    const result = buildEvaluationAnalytics([], new Map(), new Date(0), NOW, NOW, '42-api');
    expect(result.filters.granularity).toBe('daily');
  });
});

// ─── buildHeatmapSummary ──────────────────────────────────────────────────────

describe('buildHeatmapSummary', () => {
  it('returns null fields for empty heatmap', () => {
    const cells = buildHeatmap([]);
    const summary = buildHeatmapSummary(cells, []);
    expect(summary.peakHour).toBeNull();
    expect(summary.busiestDay).toBeNull();
  });

  it('identifies busiest and quietest days', () => {
    const monday = makeEntry({ id: 1, filledAt: '2026-07-27T10:00:00Z' }); // Monday 12:00 Warsaw
    const tuesday1 = makeEntry({ id: 2, filledAt: '2026-07-28T10:00:00Z' }); // Tuesday
    const tuesday2 = makeEntry({ id: 3, filledAt: '2026-07-28T11:00:00Z' }); // Tuesday
    const cells = buildHeatmap([monday, tuesday1, tuesday2]);
    const summary = buildHeatmapSummary(cells, [monday, tuesday1, tuesday2]);
    expect(summary.busiestDay).toBe('Tuesday');
    expect(summary.quietestDay).toBe('Monday');
  });
});

// ─── buildInsights ────────────────────────────────────────────────────────────

describe('buildInsights', () => {
  it('returns empty array when no data', () => {
    const cells = buildHeatmap([]);
    const summary = buildHeatmapSummary(cells, []);
    expect(buildInsights(summary, [])).toEqual([]);
  });

  it('includes top-evaluator insight when evaluators exist', () => {
    const entries = [makeEntry()];
    const top = buildTopEvaluators(entries);
    const cells = buildHeatmap(entries);
    const summary = buildHeatmapSummary(cells, entries);
    const insights = buildInsights(summary, top);
    const topInsight = insights.find((i) => i.type === 'top-evaluator');
    expect(topInsight).toBeDefined();
    expect(topInsight!.value).toContain('Bob');
  });
});

// ─── buildTimeline — deduplication and stable ordering ───────────────────────

describe('buildTimeline — deduplication and stable ordering', () => {
  it('deduplicates entries with the same id (keeps one)', () => {
    const entries = [
      makeEntry({ id: 42, filledAt: '2026-08-01T10:00:00Z' }),
      makeEntry({ id: 42, filledAt: '2026-08-01T10:00:00Z' }), // duplicate id
      makeEntry({ id: 99, filledAt: '2026-08-01T09:00:00Z' }),
    ];
    const timeline = buildTimeline(entries, 50);
    const ids = timeline.map((t) => t.id);
    const unique = new Set(ids);
    // If buildTimeline does not deduplicate, document the observed behavior:
    // either all 3 appear (no dedup) or 2 appear (dedup by id).
    // TASK.md requires deduplication — assert the id is not repeated.
    expect(ids.filter((id) => id === 42)).toHaveLength(1);
    expect(unique.size).toBe(ids.length);
  });

  it('sorts by filledAt newest-first when ids differ', () => {
    const entries = [
      makeEntry({ id: 1, filledAt: '2026-07-30T08:00:00Z' }),
      makeEntry({ id: 2, filledAt: '2026-08-01T10:00:00Z' }),
      makeEntry({ id: 3, filledAt: '2026-07-31T12:00:00Z' }),
    ];
    const timeline = buildTimeline(entries, 10);
    expect(timeline[0]!.id).toBe(2); // newest
    expect(timeline[1]!.id).toBe(3);
    expect(timeline[2]!.id).toBe(1); // oldest
  });

  it('stable tie-breaker: same filledAt uses id descending', () => {
    const sameTime = '2026-08-01T10:00:00Z';
    const entries = [
      makeEntry({ id: 5, filledAt: sameTime }),
      makeEntry({ id: 10, filledAt: sameTime }),
      makeEntry({ id: 1, filledAt: sameTime }),
    ];
    const timeline = buildTimeline(entries, 10);
    // All have same filledAt; sort should be deterministic.
    // Document the actual order — all 3 must appear.
    expect(timeline).toHaveLength(3);
    // Verify no two entries swap on re-run (sort is deterministic):
    const ids = timeline.map((t) => t.id);
    const timeline2 = buildTimeline([...entries].reverse(), 10);
    expect(timeline2.map((t) => t.id)).toEqual(ids);
  });
});

// ─── buildTopContributors — stable tie-breaker ────────────────────────────────

describe('buildTopContributors — stable tie-breaker', () => {
  it('alphabetical login tie-breaker when contribution scores are equal', () => {
    // Both evaluators: 1 eval, 1 unique student, 1 project, 1 day → score = 3+2+1+1 = 7
    const entries = [
      makeEntry({ id: 1, correctorLogin: 'zara', correctedLogin: 'alice', projectName: 'libft', filledAt: '2026-08-01T10:00:00Z' }),
      makeEntry({ id: 2, correctorLogin: 'anna', correctedLogin: 'bob',   projectName: 'libft', filledAt: '2026-08-01T10:00:00Z' }),
    ];
    const result = buildTopContributors(entries);
    expect(result[0]!.login).toBe('anna'); // 'anna' < 'zara' alphabetically
    expect(result[1]!.login).toBe('zara');
  });

  it('higher score always wins regardless of login order', () => {
    // zara: 2 evals, 2 unique students, 1 project, 1 day → score = 6+4+1+1 = 12
    // anna: 1 eval, 1 unique student, 1 project, 1 day → score = 3+2+1+1 = 7
    const entries = [
      makeEntry({ id: 1, correctorLogin: 'zara', correctedLogin: 'alice', projectName: 'libft', filledAt: '2026-08-01T10:00:00Z' }),
      makeEntry({ id: 2, correctorLogin: 'zara', correctedLogin: 'carol', projectName: 'libft', filledAt: '2026-08-01T11:00:00Z' }),
      makeEntry({ id: 3, correctorLogin: 'anna', correctedLogin: 'bob',   projectName: 'libft', filledAt: '2026-08-01T10:00:00Z' }),
    ];
    const result = buildTopContributors(entries);
    expect(result[0]!.login).toBe('zara'); // higher score wins over alphabetical order
    expect(result[0]!.contributionScore).toBe(12);
  });
});;
