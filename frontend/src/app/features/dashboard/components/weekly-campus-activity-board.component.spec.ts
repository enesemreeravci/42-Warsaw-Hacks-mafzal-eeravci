import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeeklyCampusActivityBoardComponent } from './weekly-campus-activity-board.component';
import type { WeeklyActivityStudent, WeeklyCampusActivityResponse } from '../../../core/models/api.models';

function fakeStudent(overrides: Partial<WeeklyActivityStudent> & { userId: number }): WeeklyActivityStudent {
  return {
    login: `student${overrides.userId}`,
    displayName: `Student ${overrides.userId}`,
    imageUrl: null,
    totalMinutes: 120,
    totalHours: 2,
    sessionCount: 3,
    averageSessionMinutes: 40,
    uniqueHostCount: 2,
    ...overrides,
  };
}

function fakeActivity(overrides: Partial<WeeklyCampusActivityResponse> = {}): WeeklyCampusActivityResponse {
  return {
    period: { start: '2026-07-24T12:00:00.000Z', end: '2026-07-31T12:00:00.000Z', timeZone: 'Europe/Warsaw' },
    mostCampusTime: [],
    mostSessionsStarted: [],
    summary: { validStudents: 0, locationRecordsProcessed: 0, uniqueActiveStudents: 0, totalCampusMinutes: 0, totalSessions: 0 },
    meta: { campusId: 67, cursusId: 21, source: '42-api', lastUpdated: '2026-07-31T12:00:00.000Z', limitation: '' },
    ...overrides,
  };
}

describe('WeeklyCampusActivityBoardComponent', () => {
  let fixture: ComponentFixture<WeeklyCampusActivityBoardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WeeklyCampusActivityBoardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(WeeklyCampusActivityBoardComponent);
    fixture.componentRef.setInput('metric', 'time');
    fixture.componentRef.setInput('title', 'Most Campus Time — Last 7 Days');
  });

  it('shows the loading message while activity is null and no error is recorded', async () => {
    fixture.componentRef.setInput('activity', null);
    fixture.componentRef.setInput('loadError', null);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Calculating this week's campus activity");
  });

  it('shows the error message when activity is null and a load error is recorded', async () => {
    fixture.componentRef.setInput('activity', null);
    fixture.componentRef.setInput('loadError', 'Network error');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Weekly campus activity is temporarily unavailable.');
  });

  it('shows the empty message when the ranking for this metric has no entries', async () => {
    fixture.componentRef.setInput('activity', fakeActivity({ mostCampusTime: [] }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('No valid campus sessions were found for the selected period.');
  });

  it('renders ranked students with formatted time, never NaN/undefined/null/Infinity in the DOM', async () => {
    const students = [
      fakeStudent({ userId: 1, login: 'afzal', totalMinutes: 2550, sessionCount: 12, averageSessionMinutes: 213 }),
      fakeStudent({ userId: 2, login: 'bella', totalMinutes: 900, sessionCount: 5, averageSessionMinutes: 180 }),
    ];
    fixture.componentRef.setInput('activity', fakeActivity({ mostCampusTime: students }));
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('42h 30m'); // 2550 minutes
    expect(text).toContain('@afzal');
    expect(text).toContain('@bella');
    expect(text).not.toMatch(/\bNaN\b/);
    expect(text).not.toMatch(/\bundefined\b/);
    expect(text).not.toMatch(/\bInvalid Date\b/);
    expect(text).not.toMatch(/\bInfinity\b/);
  });

  it('shows both ranked students', async () => {
    const students = [
      fakeStudent({ userId: 1, login: 'second', totalMinutes: 100 }),
      fakeStudent({ userId: 2, login: 'first', totalMinutes: 500 }),
    ];
    // Backend already returns these pre-ranked; the component trusts that order.
    fixture.componentRef.setInput('activity', fakeActivity({ mostCampusTime: [students[1]!, students[0]!] }));
    fixture.detectChanges();
    await fixture.whenStable();

    // The podium layout renders silver-gold-bronze left-to-right, so DOM order differs from
    // rank order. We check both logins are present regardless of position.
    const allLogins = Array.from(
      fixture.nativeElement.querySelectorAll('.podium-slot__login, .board__rest-login'),
    ).map((el) => (el as HTMLElement).textContent?.trim());
    expect(allLogins).toContain('@first');
    expect(allLogins).toContain('@second');
  });

  it('shows a cached-data banner with the last-updated time when meta.source is "cache"', async () => {
    fixture.componentRef.setInput(
      'activity',
      fakeActivity({ mostCampusTime: [fakeStudent({ userId: 1 })], meta: { campusId: 67, cursusId: 21, source: 'cache', lastUpdated: '2026-07-31T12:00:00.000Z', limitation: '', warning: 'stale' } }),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Showing cached data. Last updated:');
  });

  it('does not show a cached-data banner for a normal, fresh result', async () => {
    fixture.componentRef.setInput('activity', fakeActivity({ mostCampusTime: [fakeStudent({ userId: 1 })] }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain('Showing cached data');
  });
});
