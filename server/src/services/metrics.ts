import type {
  CompletionTrendPoint,
  DashboardSummary,
  ProjectCompletion,
  ProjectMetric,
  StudentSummary,
} from '../models/types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysAgo(date: Date, days: number): Date {
  return new Date(date.getTime() - days * DAY_MS);
}

export function averageLevel(students: StudentSummary[]): number {
  const active = students.filter((s) => s.active);
  if (active.length === 0) return 0;
  const total = active.reduce((sum, s) => sum + s.level, 0);
  return Math.round((total / active.length) * 100) / 100;
}

export function countCompletionsSince(completions: ProjectCompletion[], since: Date): number {
  return completions.filter((c) => c.validated && new Date(c.completedAt) >= since).length;
}

export function latestCompletionAt(completions: ProjectCompletion[]): string | null {
  const validated = completions.filter((c) => c.validated);
  if (validated.length === 0) return null;
  return validated.reduce((latest, c) => (new Date(c.completedAt) > new Date(latest) ? c.completedAt : latest), validated[0]!.completedAt);
}

export function buildDashboardSummary(
  students: StudentSummary[],
  completions: ProjectCompletion[],
  generatedAt: Date,
  cacheStatus: DashboardSummary['cacheStatus'],
): DashboardSummary {
  const validated = completions.filter((c) => c.validated);
  return {
    totalStudents: students.length,
    activeStudents: students.filter((s) => s.active).length,
    averageLevel: averageLevel(students),
    completionsLast7Days: countCompletionsSince(completions, daysAgo(generatedAt, 7)),
    completionsLast30Days: countCompletionsSince(completions, daysAgo(generatedAt, 30)),
    totalValidatedCompletions: validated.length,
    latestCompletionAt: latestCompletionAt(completions),
    generatedAt: generatedAt.toISOString(),
    cacheStatus,
  };
}

export function buildCompletionTrend(completions: ProjectCompletion[], days: number, referenceDate: Date): CompletionTrendPoint[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = daysAgo(referenceDate, i).toISOString().slice(0, 10);
    buckets.set(key, 0);
  }

  const since = daysAgo(referenceDate, days);
  for (const completion of completions) {
    if (!completion.validated) continue;
    const completedAt = new Date(completion.completedAt);
    if (completedAt < since) continue;
    const key = completedAt.toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

export function buildProjectMetrics(completions: ProjectCompletion[]): ProjectMetric[] {
  const byProject = new Map<number, { projectName: string; records: ProjectCompletion[] }>();

  for (const completion of completions) {
    if (completion.status !== 'finished') continue;
    const bucket = byProject.get(completion.projectId) ?? { projectName: completion.projectName, records: [] };
    bucket.records.push(completion);
    byProject.set(completion.projectId, bucket);
  }

  const metrics: ProjectMetric[] = [];
  for (const [projectId, { projectName, records }] of byProject) {
    const successful = records.filter((r) => r.validated);
    const failed = records.filter((r) => !r.validated);
    const marks = records.filter((r) => r.finalMark !== null).map((r) => r.finalMark as number);
    const averageFinalMark = marks.length > 0 ? Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 100) / 100 : 0;
    const successRate = records.length > 0 ? Math.round((successful.length / records.length) * 10000) / 100 : 0;

    metrics.push({
      projectId,
      projectName,
      completionCount: records.length,
      successfulCompletionCount: successful.length,
      failedCompletionCount: failed.length,
      averageFinalMark,
      successRate,
    });
  }

  return metrics;
}

export function topProjectsByCompletions(metrics: ProjectMetric[], limit: number): ProjectMetric[] {
  return [...metrics].sort((a, b) => b.completionCount - a.completionCount).slice(0, limit);
}

export function topStudentsByLevel(students: StudentSummary[], limit: number): StudentSummary[] {
  return [...students].sort((a, b) => b.level - a.level).slice(0, limit);
}

export function topStudentsByCompletedProjects(students: StudentSummary[], limit: number): StudentSummary[] {
  return [...students].sort((a, b) => b.completedProjectCount - a.completedProjectCount).slice(0, limit);
}

export function topStudentsByRecentCompletions(
  students: StudentSummary[],
  completions: ProjectCompletion[],
  days: number,
  referenceDate: Date,
  limit: number,
): Array<StudentSummary & { recentCompletionCount: number }> {
  const since = daysAgo(referenceDate, days);
  const countByStudent = new Map<number, number>();
  for (const c of completions) {
    if (!c.validated || new Date(c.completedAt) < since) continue;
    countByStudent.set(c.studentId, (countByStudent.get(c.studentId) ?? 0) + 1);
  }

  return students
    .map((s) => ({ ...s, recentCompletionCount: countByStudent.get(s.id) ?? 0 }))
    .filter((s) => s.recentCompletionCount > 0)
    .sort((a, b) => b.recentCompletionCount - a.recentCompletionCount)
    .slice(0, limit);
}
