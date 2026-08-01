import type {
  EvaluationActivityPoint,
  EvaluationAnalyticsEntry,
  EvaluationAnalyticsResponse,
  EvaluationHeatmapCell,
  EvaluationHeatmapSummary,
  EvaluationInsight,
  EvaluationKPI,
  EvaluationProjectRanking,
  EvaluationTimelineEntry,
  MostEvaluatedStudentEntry,
  RawScaleTeam,
  StudentSummary,
  TopContributorEntry,
  TopEvaluatorEntry,
} from '../models/types.js';

const WARSAW_TZ = 'Europe/Warsaw';
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

function getWarsawComponents(date: Date): { weekday0: number; hour: number; dateStr: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WARSAW_TZ,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});

  const dayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const weekday0 = dayMap[parts['weekday'] ?? ''] ?? 0;
  const hour = parseInt(parts['hour'] ?? '0', 10) % 24;
  const dateStr = `${parts['year']}-${parts['month']}-${parts['day']}`;
  return { weekday0, hour, dateStr };
}

function getWarsawDateStr(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: WARSAW_TZ, dateStyle: 'short' }).format(date);
}

/**
 * Best-effort project name resolution. scale.project.name is the canonical field but the 42 API
 * does not always embed it in the scale_teams response. team.name is the next best option —
 * for most Warsaw cursus projects a team's name is derived from the project slug.
 */
function resolveProjectName(raw: RawScaleTeam): string | null {
  return raw.scale?.project?.name ?? raw.team?.name ?? null;
}

function resolveProjectId(raw: RawScaleTeam): number | null {
  return raw.scale?.project?.id ?? raw.team?.project_id ?? null;
}

/**
 * Normalizes a raw scale_team to an analytics entry. Returns null when the record
 * is incomplete (no corrector, no corrected student, or not yet filled).
 */
export function normalizeAnalyticsEntry(
  raw: RawScaleTeam,
  studentsByLogin: Map<string, StudentSummary>,
): EvaluationAnalyticsEntry | null {
  if (!raw.filled_at) return null;
  const corrected = raw.correcteds?.[0];
  if (!corrected) return null;
  const corrector = raw.corrector;
  if (!corrector) return null;

  const correctedStudent = studentsByLogin.get(corrected.login.toLowerCase());
  const correctorStudent = studentsByLogin.get(corrector.login.toLowerCase());

  return {
    id: raw.id,
    correctorLogin: corrector.login,
    correctorDisplayName: correctorStudent?.displayName ?? corrector.login,
    correctorImageUrl: correctorStudent?.imageUrl ?? null,
    correctorLevel: correctorStudent?.level ?? 0,
    correctedLogin: corrected.login,
    correctedDisplayName: correctedStudent?.displayName ?? corrected.login,
    correctedImageUrl: correctedStudent?.imageUrl ?? null,
    projectId: resolveProjectId(raw),
    projectName: resolveProjectName(raw),
    finalMark: raw.final_mark,
    flagPositive: raw.flag?.positive ?? null,
    filledAt: raw.filled_at,
  };
}

/** Builds a full 7×24 (168-cell) heatmap in Warsaw local time. Mon=dayIndex 0, Sun=6. */
export function buildHeatmap(entries: EvaluationAnalyticsEntry[]): EvaluationHeatmapCell[] {
  type CellAcc = { count: number; projects: Map<string, number>; evaluators: Map<string, number> };
  const matrix = new Map<string, CellAcc>();
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      matrix.set(`${d}:${h}`, { count: 0, projects: new Map(), evaluators: new Map() });
    }
  }

  for (const entry of entries) {
    const { weekday0, hour } = getWarsawComponents(new Date(entry.filledAt));
    const cell = matrix.get(`${weekday0}:${hour}`)!;
    cell.count++;
    if (entry.projectName) cell.projects.set(entry.projectName, (cell.projects.get(entry.projectName) ?? 0) + 1);
    cell.evaluators.set(entry.correctorLogin, (cell.evaluators.get(entry.correctorLogin) ?? 0) + 1);
  }

  const result: EvaluationHeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const cell = matrix.get(`${d}:${h}`)!;
      const topProject =
        cell.projects.size > 0
          ? ([...cell.projects.entries()].sort((a, b) => b[1] - a[1])[0]![0] ?? null)
          : null;
      const topEvaluator =
        cell.evaluators.size > 0
          ? ([...cell.evaluators.entries()].sort((a, b) => b[1] - a[1])[0]![0] ?? null)
          : null;
      result.push({ dayIndex: d, dayLabel: WEEKDAY_LABELS[d]!, hour: h, count: cell.count, topProject, topEvaluator });
    }
  }
  return result;
}

/** KPI cards for the selected period window. `historicalAvailable` is always false. */
export function buildKPI(entries: EvaluationAnalyticsEntry[], now: Date): EvaluationKPI {
  const todayStr = getWarsawDateStr(now);
  const { weekday0 } = getWarsawComponents(now);
  const weekStart = new Date(now.getTime() - weekday0 * DAY_MS);
  weekStart.setUTCHours(0, 0, 0, 0);

  const evaluationsToday = entries.filter((e) => getWarsawDateStr(new Date(e.filledAt)) === todayStr).length;
  const evaluationsThisWeek = entries.filter((e) => new Date(e.filledAt) >= weekStart).length;

  const projectCounts = new Map<string, number>();
  for (const e of entries) {
    if (e.projectName) projectCounts.set(e.projectName, (projectCounts.get(e.projectName) ?? 0) + 1);
  }
  const mostEvaluatedProject =
    projectCounts.size > 0
      ? ([...projectCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null)
      : null;

  const daySet = new Set(entries.map((e) => getWarsawDateStr(new Date(e.filledAt))));
  const averagePerDay = daySet.size > 0 ? Math.round((entries.length / daySet.size) * 10) / 10 : 0;

  return {
    evaluationsToday,
    evaluationsThisWeek,
    activeEvaluators: new Set(entries.map((e) => e.correctorLogin)).size,
    studentsEvaluated: new Set(entries.map((e) => e.correctedLogin)).size,
    mostEvaluatedProject,
    averagePerDay,
    historicalAvailable: false,
  };
}

/** Aggregate-level summary derived from the heatmap cells. */
export function buildHeatmapSummary(cells: EvaluationHeatmapCell[], entries: EvaluationAnalyticsEntry[]): EvaluationHeatmapSummary {
  if (cells.every((c) => c.count === 0)) {
    return { peakHour: null, peakHourLabel: null, busiestDay: null, quietestDay: null, averageDailyEvaluations: 0 };
  }

  const hourTotals = new Array<number>(24).fill(0);
  const dayTotals = new Array<number>(7).fill(0);
  for (const cell of cells) {
    hourTotals[cell.hour] = (hourTotals[cell.hour] ?? 0) + cell.count;
    dayTotals[cell.dayIndex] = (dayTotals[cell.dayIndex] ?? 0) + cell.count;
  }

  const peakHour = hourTotals.indexOf(Math.max(...hourTotals));
  const peakHourLabel = `${String(peakHour).padStart(2, '0')}:00–${String(peakHour + 1).padStart(2, '0')}:00`;

  const maxDayVal = Math.max(...dayTotals);
  const busiestDay = maxDayVal > 0 ? (WEEKDAY_LABELS[dayTotals.indexOf(maxDayVal)] ?? null) : null;
  const nonZero = dayTotals.map((v, i) => ({ v, i })).filter((x) => x.v > 0);
  const minDayEntry = nonZero.length > 1 ? nonZero.reduce((a, b) => (a.v <= b.v ? a : b)) : null;
  const quietestDay = minDayEntry && minDayEntry.v < maxDayVal ? (WEEKDAY_LABELS[minDayEntry.i] ?? null) : null;

  const daySet = new Set(entries.map((e) => getWarsawDateStr(new Date(e.filledAt))));
  const averageDailyEvaluations = daySet.size > 0 ? Math.round((entries.length / daySet.size) * 10) / 10 : 0;

  return { peakHour, peakHourLabel, busiestDay, quietestDay, averageDailyEvaluations };
}

/** Top evaluators sorted by evaluation count desc. */
export function buildTopEvaluators(entries: EvaluationAnalyticsEntry[], limit = 10): TopEvaluatorEntry[] {
  type Acc = { login: string; displayName: string; imageUrl: string | null; level: number; count: number; students: Set<string>; projects: Set<string>; lastAt: string };
  const map = new Map<string, Acc>();

  for (const e of entries) {
    const ex = map.get(e.correctorLogin);
    if (ex) {
      ex.count++;
      ex.students.add(e.correctedLogin);
      if (e.projectName) ex.projects.add(e.projectName);
      if (e.filledAt > ex.lastAt) ex.lastAt = e.filledAt;
    } else {
      map.set(e.correctorLogin, {
        login: e.correctorLogin,
        displayName: e.correctorDisplayName,
        imageUrl: e.correctorImageUrl,
        level: e.correctorLevel,
        count: 1,
        students: new Set([e.correctedLogin]),
        projects: new Set(e.projectName ? [e.projectName] : []),
        lastAt: e.filledAt,
      });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt) || a.login.localeCompare(b.login))
    .slice(0, limit)
    .map((x) => ({
      login: x.login,
      displayName: x.displayName,
      imageUrl: x.imageUrl,
      level: x.level,
      evaluationCount: x.count,
      uniqueStudentsEvaluated: x.students.size,
      uniqueProjectsEvaluated: x.projects.size,
      lastEvaluationAt: x.lastAt,
    }));
}

/** Most evaluated students sorted by received evaluations desc. */
export function buildMostEvaluatedStudents(entries: EvaluationAnalyticsEntry[], limit = 10): MostEvaluatedStudentEntry[] {
  type Acc = { login: string; displayName: string; imageUrl: string | null; level: number; count: number; projects: Set<string>; lastAt: string };
  const map = new Map<string, Acc>();

  for (const e of entries) {
    const ex = map.get(e.correctedLogin);
    if (ex) {
      ex.count++;
      if (e.projectName) ex.projects.add(e.projectName);
      if (e.filledAt > ex.lastAt) ex.lastAt = e.filledAt;
    } else {
      map.set(e.correctedLogin, {
        login: e.correctedLogin,
        displayName: e.correctedDisplayName,
        imageUrl: e.correctedImageUrl,
        level: 0,
        count: 1,
        projects: new Set(e.projectName ? [e.projectName] : []),
        lastAt: e.filledAt,
      });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt) || a.login.localeCompare(b.login))
    .slice(0, limit)
    .map((x) => ({
      login: x.login,
      displayName: x.displayName,
      imageUrl: x.imageUrl,
      level: x.level,
      evaluationsReceived: x.count,
      uniqueProjects: x.projects.size,
      lastEvaluationAt: x.lastAt,
    }));
}

/**
 * Composite contribution ranking.
 * Score = (evaluationCount × 3) + (uniqueStudents × 2) + uniqueProjects + activeDays
 * This rewards both volume and variety; it is not an official 42 metric.
 */
export function buildTopContributors(entries: EvaluationAnalyticsEntry[], limit = 10): TopContributorEntry[] {
  type Acc = { login: string; displayName: string; imageUrl: string | null; level: number; count: number; students: Set<string>; projects: Set<string>; days: Set<string>; lastAt: string };
  const map = new Map<string, Acc>();

  for (const e of entries) {
    const dateStr = getWarsawDateStr(new Date(e.filledAt));
    const ex = map.get(e.correctorLogin);
    if (ex) {
      ex.count++;
      ex.students.add(e.correctedLogin);
      if (e.projectName) ex.projects.add(e.projectName);
      ex.days.add(dateStr);
      if (e.filledAt > ex.lastAt) ex.lastAt = e.filledAt;
    } else {
      map.set(e.correctorLogin, {
        login: e.correctorLogin,
        displayName: e.correctorDisplayName,
        imageUrl: e.correctorImageUrl,
        level: e.correctorLevel,
        count: 1,
        students: new Set([e.correctedLogin]),
        projects: new Set(e.projectName ? [e.projectName] : []),
        days: new Set([dateStr]),
        lastAt: e.filledAt,
      });
    }
  }

  return [...map.values()]
    .map((x) => {
      const sc = {
        evaluations: x.count * 3,
        uniqueStudents: x.students.size * 2,
        uniqueProjects: x.projects.size,
        activeDays: x.days.size,
      };
      return {
        login: x.login,
        displayName: x.displayName,
        imageUrl: x.imageUrl,
        level: x.level,
        evaluationCount: x.count,
        uniqueStudentsEvaluated: x.students.size,
        uniqueProjectsEvaluated: x.projects.size,
        lastEvaluationAt: x.lastAt,
        contributionScore: sc.evaluations + sc.uniqueStudents + sc.uniqueProjects + sc.activeDays,
        scoreComponents: sc,
      };
    })
    .sort((a, b) => b.contributionScore - a.contributionScore || a.login.localeCompare(b.login))
    .slice(0, limit);
}

/** Project rankings sorted by total evaluations desc. */
export function buildProjectRankings(entries: EvaluationAnalyticsEntry[], limit = 15): EvaluationProjectRanking[] {
  const map = new Map<string, { total: number; students: Set<string>; marks: number[] }>();

  for (const e of entries) {
    const name = e.projectName ?? '(Unknown)';
    const ex = map.get(name);
    if (ex) {
      ex.total++;
      ex.students.add(e.correctedLogin);
      if (e.finalMark !== null) ex.marks.push(e.finalMark);
    } else {
      map.set(name, { total: 1, students: new Set([e.correctedLogin]), marks: e.finalMark !== null ? [e.finalMark] : [] });
    }
  }

  return [...map.entries()]
    .sort(([na, a], [nb, b]) => b.total - a.total || b.students.size - a.students.size || na.localeCompare(nb))
    .slice(0, limit)
    .map(([name, d]) => ({
      projectName: name,
      totalEvaluations: d.total,
      uniqueStudents: d.students.size,
      averageMark: d.marks.length > 0 ? Math.round((d.marks.reduce((s, m) => s + m, 0) / d.marks.length) * 10) / 10 : null,
    }));
}

/** Daily evaluation count series, sorted chronologically. */
export function buildActivitySeries(entries: EvaluationAnalyticsEntry[]): EvaluationActivityPoint[] {
  const byDay = new Map<string, number>();
  for (const e of entries) {
    const d = getWarsawDateStr(new Date(e.filledAt));
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, count]) => ({ period, count }));
}

export interface EvaluationFilters {
  studentLogin?: string | null;
  evaluatorLogin?: string | null;
  projectName?: string | null;
}

export type EvaluationGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly';

/** Applies login/project text filters. Case-insensitive substring match. */
export function applyEvaluationFilters(
  entries: EvaluationAnalyticsEntry[],
  filters: EvaluationFilters,
): EvaluationAnalyticsEntry[] {
  let result = entries;
  if (filters.studentLogin) {
    const sl = filters.studentLogin.toLowerCase();
    result = result.filter((e) => e.correctedLogin.toLowerCase().includes(sl));
  }
  if (filters.evaluatorLogin) {
    const el = filters.evaluatorLogin.toLowerCase();
    result = result.filter((e) => e.correctorLogin.toLowerCase().includes(el));
  }
  if (filters.projectName) {
    const pn = filters.projectName.toLowerCase();
    result = result.filter((e) => (e.projectName?.toLowerCase() ?? '').includes(pn));
  }
  return result;
}

function getISOWeekLabel(warsawDateStr: string): string {
  const d = new Date(`${warsawDateStr}T00:00:00Z`);
  const dow = d.getUTCDay();
  const daysToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getTime() + daysToMonday * DAY_MS);
  const year = monday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const jan4Monday = new Date(jan4.getTime() - (jan4Dow - 1) * DAY_MS);
  const weekNo = Math.floor((monday.getTime() - jan4Monday.getTime()) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

/** Activity series with configurable granularity (hourly, daily, weekly, monthly). */
export function buildActivitySeriesWithGranularity(
  entries: EvaluationAnalyticsEntry[],
  granularity: EvaluationGranularity = 'daily',
): EvaluationActivityPoint[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    const date = new Date(e.filledAt);
    const { hour, dateStr } = getWarsawComponents(date);
    let key: string;
    switch (granularity) {
      case 'hourly':
        key = `${dateStr}T${String(hour).padStart(2, '0')}:00`;
        break;
      case 'weekly':
        key = getISOWeekLabel(dateStr);
        break;
      case 'monthly':
        key = dateStr.slice(0, 7);
        break;
      default:
        key = dateStr;
    }
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, count]) => ({ period, count }));
}

/** Recent evaluations newest-first for the timeline feed. Deduplicates by id. */
export function buildTimeline(entries: EvaluationAnalyticsEntry[], limit = 20): EvaluationTimelineEntry[] {
  const seen = new Set<number>();
  return [...entries]
    .sort((a, b) => new Date(b.filledAt).getTime() - new Date(a.filledAt).getTime() || b.id - a.id)
    .filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      filledAt: e.filledAt,
      correctorLogin: e.correctorLogin,
      correctedLogin: e.correctedLogin,
      projectName: e.projectName,
      finalMark: e.finalMark,
      flagPositive: e.flagPositive,
    }));
}

/** Text-form insights derived deterministically from the data. */
export function buildInsights(summary: EvaluationHeatmapSummary, topEvaluators: TopEvaluatorEntry[]): EvaluationInsight[] {
  const out: EvaluationInsight[] = [];
  if (summary.busiestDay) out.push({ type: 'busiest-day', label: 'Busiest day', value: summary.busiestDay });
  if (summary.quietestDay) out.push({ type: 'quietest-day', label: 'Quietest day', value: summary.quietestDay });
  if (summary.peakHourLabel) out.push({ type: 'peak-time', label: 'Peak evaluation window', value: summary.peakHourLabel });
  if (topEvaluators[0]) {
    out.push({
      type: 'top-evaluator',
      label: 'Most active evaluator',
      value: `${topEvaluators[0].displayName} (${topEvaluators[0].evaluationCount} evaluations)`,
    });
  }
  return out;
}

/**
 * Builds the full evaluation analytics response from raw 42 API data filtered
 * to the requested [from, to] time window. Historical comparisons are never
 * displayed — `meta.historicalAvailable` is always false.
 */
export function buildEvaluationAnalytics(
  rawScaleTeams: RawScaleTeam[],
  studentsByLogin: Map<string, StudentSummary>,
  from: Date,
  to: Date,
  now: Date,
  source: '42-api' | 'cache',
  filters: EvaluationFilters = {},
  granularity: EvaluationGranularity = 'daily',
): EvaluationAnalyticsResponse {
  const fromMs = from.getTime();
  const toMs = to.getTime();

  let entries = rawScaleTeams
    .map((r) => normalizeAnalyticsEntry(r, studentsByLogin))
    .filter((e): e is EvaluationAnalyticsEntry => e !== null)
    .filter((e) => {
      const t = new Date(e.filledAt).getTime();
      return t >= fromMs && t <= toMs;
    });

  entries = applyEvaluationFilters(entries, filters);

  const heatmap = buildHeatmap(entries);
  const heatmapSummary = buildHeatmapSummary(heatmap, entries);
  const kpi = buildKPI(entries, now);
  const topEvaluators = buildTopEvaluators(entries);
  const mostEvaluatedStudents = buildMostEvaluatedStudents(entries);
  const topContributors = buildTopContributors(entries);
  const projectRankings = buildProjectRankings(entries);
  const activitySeries = buildActivitySeriesWithGranularity(entries, granularity);
  const timeline = buildTimeline(entries);
  const insights = buildInsights(heatmapSummary, topEvaluators);

  return {
    generatedAt: now.toISOString(),
    timezone: WARSAW_TZ,
    filters: {
      range: 'custom',
      from: from.toISOString(),
      to: to.toISOString(),
      studentLogin: filters.studentLogin ?? null,
      evaluatorLogin: filters.evaluatorLogin ?? null,
      projectName: filters.projectName ?? null,
      granularity,
    },
    kpi,
    heatmap,
    heatmapSummary,
    activitySeries,
    topEvaluators,
    mostEvaluatedStudents,
    topContributors,
    projectRankings,
    timeline,
    insights,
    meta: {
      totalEvaluations: entries.length,
      dataWindowDays: Math.ceil((toMs - fromMs) / DAY_MS),
      historicalAvailable: false,
      note: 'Historical data is not available yet.',
      source,
    },
  };
}
