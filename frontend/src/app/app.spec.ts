import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { DashboardStore } from './core/services/dashboard-store.service';

/** A stub store keeps this a true component test - no real HTTP calls fired via DashboardStore.init(). */
class DashboardStoreStub {
  data = signal({
    summary: null,
    recentCompletions: [],
    trend: [],
    topProjects: [],
    topStudentsByLevel: [],
    topStudentsByCompletedProjects: [],
    livePulse: null,
  });
  loading = signal(false);
  refreshing = signal(false);
  error = signal(null);
  stale = signal(false);
  warming = signal(false);
  lastSuccessfulUpdate = signal<Date | null>(null);
  lastFailedUpdate = signal<Date | null>(null);
  autoRefreshEnabled = signal(true);
  autoRefreshIntervalSeconds = signal(300);
  countdownSeconds = signal(300);
  selectedPeriodDays = signal(30);
  config = signal(null);
  ft42Status = signal(null);

  init = (): void => undefined;
  refreshNow = (): void => undefined;
  toggleAutoRefresh = (): void => undefined;
  setAutoRefreshInterval = (): void => undefined;
  setPeriodDays = (): void => undefined;
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: DashboardStore, useValue: new DashboardStoreStub() },
      ],
    }).compileComponents();
  });

  it('creates the app shell', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the 42 Warsaw brand title', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-header__title')?.textContent).toContain('42 Warsaw Overview');
  });
});
