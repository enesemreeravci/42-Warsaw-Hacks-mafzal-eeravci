import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type {
  ApiEnvelope,
  AppConfigResponse,
  CompletionTrendPoint,
  DashboardSummary,
  Ft42Status,
  HealthResponse,
  LivePulseResponse,
  PaginatedResult,
  ProjectCompletion,
  ProjectListing,
  ProjectMetric,
  SortDirection,
  SortField,
  StudentDetail,
  StudentRanking,
  StudentSummary,
  TopStudentMetric,
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
}

export function extractData<T>(): (source: Observable<ApiEnvelope<T>>) => Observable<T> {
  return (source) => source.pipe(map((envelope) => envelope.data));
}
