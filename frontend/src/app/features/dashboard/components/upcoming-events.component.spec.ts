import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UpcomingEventsComponent } from './upcoming-events.component';
import type { CampusEvent } from '../../../core/models/api.models';

function fakeEvent(overrides: Partial<CampusEvent> & { id: number }): CampusEvent {
  return {
    name: `Event ${overrides.id}`,
    description: null,
    location: null,
    beginAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    endAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    participants: 10,
    maxParticipants: 50,
    availableSpots: 40,
    kind: 'workshop',
    themes: [],
    ...overrides,
  };
}

describe('UpcomingEventsComponent', () => {
  let fixture: ComponentFixture<UpcomingEventsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpcomingEventsComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(UpcomingEventsComponent);
  });

  it('shows the "No upcoming events" placeholder for an empty list', async () => {
    fixture.componentRef.setInput('events', []);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('No upcoming events');
  });

  it('renders an event card with name, location, and formatted participants, never NaN/undefined/null/Infinity', async () => {
    fixture.componentRef.setInput('events', [
      fakeEvent({ id: 1, name: 'AI Workshop', location: 'Social Space', participants: 32, maxParticipants: 50, availableSpots: 18 }),
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('AI Workshop');
    expect(text).toContain('Social Space');
    expect(text).toContain('32 / 50');
    expect(text).toContain('18 spots left');
    expect(text).not.toMatch(/\bNaN\b/);
    expect(text).not.toMatch(/\bundefined\b/);
    expect(text).not.toMatch(/\bInvalid Date\b/);
    expect(text).not.toMatch(/\bInfinity\b/);
  });

  it('shows a "Live Now" badge when now falls between begin_at and end_at', async () => {
    fixture.componentRef.setInput('events', [
      fakeEvent({
        id: 1,
        beginAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        endAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Live Now');
  });

  it('does not show a "Live Now" badge for a future event', async () => {
    fixture.componentRef.setInput('events', [fakeEvent({ id: 1 })]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain('Live Now');
  });

  it('shows "registered" instead of a fraction for an uncapped event', async () => {
    fixture.componentRef.setInput('events', [fakeEvent({ id: 1, maxParticipants: null, availableSpots: null, participants: 12 })]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('12 registered');
  });

  it('renders a countdown badge in the header for the next (soonest) event', async () => {
    fixture.componentRef.setInput('events', [fakeEvent({ id: 1 })]);
    fixture.detectChanges();
    await fixture.whenStable();

    const badge = fixture.nativeElement.querySelector('.events__countdown-badge');
    expect(badge?.textContent).toMatch(/Starts in/);
  });

  it('renders theme tags when present', async () => {
    fixture.componentRef.setInput('events', [fakeEvent({ id: 1, themes: ['AI', 'Programming'] })]);
    fixture.detectChanges();
    await fixture.whenStable();

    const tags = Array.from(fixture.nativeElement.querySelectorAll('.event-card__theme')).map((el) => (el as HTMLElement).textContent?.trim());
    expect(tags).toEqual(['AI', 'Programming']);
  });
});
