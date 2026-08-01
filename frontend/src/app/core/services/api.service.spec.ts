import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import type { ApiEnvelope, DashboardSummary, HealthResponse } from '../models/api.models';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('requests GET /api/health', () => {
    const envelope: ApiEnvelope<HealthResponse> = {
      data: { status: 'ok', serverTime: 'now', uptimeSeconds: 1, cacheAvailable: true, authReady: true },
      meta: { generatedAt: 'now', cached: false },
    };

    service.getHealth().subscribe((res) => expect(res).toEqual(envelope));

    const req = httpMock.expectOne('/api/health');
    expect(req.request.method).toBe('GET');
    req.flush(envelope);
  });

  it('requests GET /api/dashboard/summary', () => {
    const envelope: ApiEnvelope<DashboardSummary> = {
      data: {
        totalStudents: 10,
        activeStudents: 8,
        averageLevel: 5,
        completionsLast7Days: 2,
        completionsLast30Days: 6,
        totalValidatedCompletions: 20,
        totalEnrolledProjects: 5,
        averageCompletionRate: 82.5,
        latestCompletionAt: null,
        generatedAt: 'now',
        cacheStatus: 'fresh',
      },
      meta: { generatedAt: 'now', cached: false },
    };

    service.getDashboardSummary().subscribe((res) => expect(res.data.totalStudents).toBe(10));

    const req = httpMock.expectOne('/api/dashboard/summary');
    expect(req.request.method).toBe('GET');
    req.flush(envelope);
  });

  it('sends search/sort/pagination query params for getStudents', () => {
    service
      .getStudents({ page: 2, pageSize: 10, search: 'af', sort: 'login', direction: 'asc', activeOnly: true })
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === '/api/students' && r.params.get('page') === '2' && r.params.get('search') === 'af' && r.params.get('activeOnly') === 'true',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: { items: [], page: 2, pageSize: 10, totalItems: 0, totalPages: 1 }, meta: { generatedAt: 'now', cached: false } });
  });

  it('POSTs to /api/dashboard/refresh with no body', () => {
    service.refreshDashboard().subscribe();

    const req = httpMock.expectOne('/api/dashboard/refresh');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { status: 'completed', startedAt: 'now' }, meta: { generatedAt: 'now', cached: false } });
  });

  it('URL-encodes the login when requesting a student profile', () => {
    service.getStudentDetail('a b').subscribe();
    const req = httpMock.expectOne('/api/students/a%20b');
    req.flush({ data: {}, meta: { generatedAt: 'now', cached: false } });
    expect(req.request.method).toBe('GET');
  });

  it('requests GET /api/dashboard/live-pulse', () => {
    service.getLivePulse().subscribe((res) => expect(res.data.activeNow).toEqual([]));

    const req = httpMock.expectOne('/api/dashboard/live-pulse');
    expect(req.request.method).toBe('GET');
    req.flush({
      data: { activeNow: [], xpLeaderboard: [], blackHoleWatch: [], achievements: [] },
      meta: { generatedAt: 'now', cached: false },
    });
  });
});
