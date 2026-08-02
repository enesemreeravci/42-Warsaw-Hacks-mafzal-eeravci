import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type {
  ApiEnvelope,
  AppConfigResponse,
  BlackHoleStatusResponse,
  CampusEvent,
  ClusterOccupancyResponse,
  CoalitionStanding,
  CompletionTrendPoint,
  DashboardSummary,
  EvaluationAnalyticsResponse,
  EvaluationEntry,
  EvaluationRangeOption,
  Ft42Status,
  HealthResponse,
  LivePulseResponse,
  PaginatedResult,
  ProjectCompletion,
  ProjectListing,
  ProjectMetric,
  ReturningPeriodOption,
  ReturningSortOption,
  ReturningStudentsResponse,
  SortDirection,
  SortField,
  StudentDetail,
  StudentRanking,
  StudentSummary,
  TopStudentMetric,
  WeeklyCampusActivityResponse,
  WeeklyTopContributorsResponse,
} from '../models/api.models';

/** Thin typed wrapper around the backend-for-frontend REST API. Every call is relative to /api. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  getHealth(): Observable<ApiEnvelope<HealthResponse>> {
    return this.http.get<ApiEnvelope<HealthResponse>>(`${this.base}/health`);
  }

  getConfig(): Observable<ApiEnvelope<AppConfigResponse>> {
    return this.http.get<ApiEnvelope<AppConfigResponse>>(`${this.base}/config`);
  }

  getDashboardSummary(): Observable<ApiEnvelope<DashboardSummary>> {
    return this.http.get<ApiEnvelope<DashboardSummary>>(`${this.base}/dashboard/summary`);
  }

  getRecentCompletions(days = 7, limit = 20): Observable<ApiEnvelope<ProjectCompletion[]>> {
    const params = new HttpParams().set('days', days).set('limit', limit);
    return this.http.get<ApiEnvelope<ProjectCompletion[]>>(`${this.base}/dashboard/recent-completions`, { params });
  }

  getCompletionTrend(days = 30): Observable<ApiEnvelope<CompletionTrendPoint[]>> {
    const params = new HttpParams().set('days', days);
    return this.http.get<ApiEnvelope<CompletionTrendPoint[]>>(`${this.base}/dashboard/completion-trend`, { params });
  }

  getTopProjects(days = 30, limit = 10): Observable<ApiEnvelope<ProjectMetric[]>> {
    const params = new HttpParams().set('days', days).set('limit', limit);
    return this.http.get<ApiEnvelope<ProjectMetric[]>>(`${this.base}/dashboard/top-projects`, { params });
  }

  getTopStudents(metric: TopStudentMetric, limit = 10, days = 30): Observable<ApiEnvelope<StudentRanking[]>> {
    const params = new HttpParams().set('metric', metric).set('limit', limit).set('days', days);
    return this.http.get<ApiEnvelope<StudentRanking[]>>(`${this.base}/dashboard/top-students`, { params });
  }

  getLivePulse(): Observable<ApiEnvelope<LivePulseResponse>> {
    return this.http.get<ApiEnvelope<LivePulseResponse>>(`${this.base}/dashboard/live-pulse`);
  }

  getCoalitions(): Observable<ApiEnvelope<CoalitionStanding[]>> {
    return this.http.get<ApiEnvelope<CoalitionStanding[]>>(`${this.base}/dashboard/coalitions`);
  }

  getEvaluations(limit = 15): Observable<ApiEnvelope<EvaluationEntry[]>> {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<ApiEnvelope<EvaluationEntry[]>>(`${this.base}/dashboard/evaluations`, { params });
  }

  getWeeklyCampusActivity(): Observable<ApiEnvelope<WeeklyCampusActivityResponse>> {
    return this.http.get<ApiEnvelope<WeeklyCampusActivityResponse>>(`${this.base}/dashboard/weekly-campus-activity`);
  }

  getClusterOccupancy(): Observable<ApiEnvelope<ClusterOccupancyResponse>> {
    return this.http.get<ApiEnvelope<ClusterOccupancyResponse>>(`${this.base}/dashboard/cluster-occupancy`);
  }

  getWeeklyContributorLeaderboard(periodDays = 7): Observable<ApiEnvelope<WeeklyTopContributorsResponse>> {
    const params = new HttpParams().set('periodDays', periodDays);
    return this.http.get<ApiEnvelope<WeeklyTopContributorsResponse>>(`${this.base}/dashboard/weekly-top-contributors`, { params });
  }

  getReturningStudents(
    period: ReturningPeriodOption = 'last7Days',
    threshold = 14,
    sort: ReturningSortOption = 'recent',
  ): Observable<ApiEnvelope<ReturningStudentsResponse>> {
    const params = new HttpParams().set('period', period).set('threshold', threshold).set('sort', sort);
    return this.http.get<ApiEnvelope<ReturningStudentsResponse>>(`${this.base}/students/returning`, { params });
  }

  getUpcomingEvents(limit = 5): Observable<ApiEnvelope<CampusEvent[]>> {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<ApiEnvelope<CampusEvent[]>>(`${this.base}/dashboard/upcoming-events`, { params });
  }

  refreshDashboard(): Observable<ApiEnvelope<{ status: string; startedAt: string; finishedAt?: string }>> {
    return this.http.post<ApiEnvelope<{ status: string; startedAt: string; finishedAt?: string }>>(`${this.base}/dashboard/refresh`, {});
  }

  getStudents(options: {
    page?: number;
    pageSize?: number;
    search?: string;
    sort?: SortField;
    direction?: SortDirection;
    activeOnly?: boolean;
  }): Observable<ApiEnvelope<PaginatedResult<StudentSummary>>> {
    let params = new HttpParams()
      .set('page', options.page ?? 1)
      .set('pageSize', options.pageSize ?? 20)
      .set('sort', options.sort ?? 'level')
      .set('direction', options.direction ?? 'desc');
    if (options.search) params = params.set('search', options.search);
    if (options.activeOnly) params = params.set('activeOnly', 'true');
    return this.http.get<ApiEnvelope<PaginatedResult<StudentSummary>>>(`${this.base}/students`, { params });
  }

  getStudentDetail(login: string): Observable<ApiEnvelope<StudentDetail>> {
    return this.http.get<ApiEnvelope<StudentDetail>>(`${this.base}/students/${encodeURIComponent(login)}`);
  }

  getProjects(): Observable<ApiEnvelope<ProjectListing[]>> {
    return this.http.get<ApiEnvelope<ProjectListing[]>>(`${this.base}/projects`);
  }

  getProjectMetrics(projectId: number): Observable<ApiEnvelope<ProjectMetric>> {
    return this.http.get<ApiEnvelope<ProjectMetric>>(`${this.base}/projects/${projectId}/metrics`);
  }

  getFt42Status(): Observable<ApiEnvelope<Ft42Status>> {
    return this.http.get<ApiEnvelope<Ft42Status>>(`${this.base}/status/42`);
  }

  getEvaluationAnalytics(
    range: EvaluationRangeOption = 'last7Days',
    filters: { studentLogin?: string | null; evaluatorLogin?: string | null; projectName?: string | null } = {},
    granularity: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily',
  ): Observable<ApiEnvelope<EvaluationAnalyticsResponse>> {
    let params = new HttpParams().set('range', range).set('granularity', granularity);
    if (filters.studentLogin) params = params.set('studentLogin', filters.studentLogin);
    if (filters.evaluatorLogin) params = params.set('evaluatorLogin', filters.evaluatorLogin);
    if (filters.projectName) params = params.set('projectName', filters.projectName);
    return this.http.get<ApiEnvelope<EvaluationAnalyticsResponse>>(`${this.base}/evaluations/analytics`, { params });
  }

  getBlackHoleStatus(
    upcomingDays = 30,
    recentDays = 30,
    filters: { loginSearch?: string | null; minLevel?: number | null; maxLevel?: number | null } = {},
  ): Observable<ApiEnvelope<BlackHoleStatusResponse>> {
    let params = new HttpParams().set('upcomingDays', upcomingDays).set('recentDays', recentDays);
    if (filters.loginSearch) params = params.set('loginSearch', filters.loginSearch);
    if (filters.minLevel != null) params = params.set('minLevel', filters.minLevel);
    if (filters.maxLevel != null) params = params.set('maxLevel', filters.maxLevel);
    return this.http.get<ApiEnvelope<BlackHoleStatusResponse>>(`${this.base}/blackhole/status`, { params });
  }
}

export function extractData<T>(): (source: Observable<ApiEnvelope<T>>) => Observable<T> {
  return (source) => source.pipe(map((envelope) => envelope.data));
}
