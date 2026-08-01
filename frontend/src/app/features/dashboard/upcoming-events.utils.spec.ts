import { formatCountdown, formatWarsawDate, isEventLiveNow, isEventToday } from './upcoming-events.utils';

const NOW = new Date('2026-08-01T12:00:00.000Z');

describe('formatWarsawDate', () => {
  it('formats a valid ISO timestamp', () => {
    expect(formatWarsawDate('2026-08-01T12:00:00.000Z')).toMatch(/\w{3},? \d{2} \w{3}/);
  });

  it('returns "Unavailable" instead of "Invalid Date" for missing/unparsable input', () => {
    expect(formatWarsawDate(null)).toBe('Unavailable');
    expect(formatWarsawDate(undefined)).toBe('Unavailable');
    expect(formatWarsawDate('not-a-date')).toBe('Unavailable');
  });
});

describe('isEventToday', () => {
  it('is true for an event starting later the same Warsaw-local day', () => {
    expect(isEventToday('2026-08-01T20:00:00.000Z', NOW)).toBe(true);
  });

  it('is false for an event starting the next day', () => {
    expect(isEventToday('2026-08-02T08:00:00.000Z', NOW)).toBe(false);
  });

  it('is false for an unparsable begin_at instead of throwing', () => {
    expect(isEventToday('not-a-date', NOW)).toBe(false);
  });
});

describe('isEventLiveNow', () => {
  it('is true when now falls between begin_at and end_at', () => {
    expect(isEventLiveNow('2026-08-01T11:00:00.000Z', '2026-08-01T13:00:00.000Z', NOW)).toBe(true);
  });

  it('is false before the event starts', () => {
    expect(isEventLiveNow('2026-08-01T13:00:00.000Z', '2026-08-01T14:00:00.000Z', NOW)).toBe(false);
  });

  it('is false after the event ends', () => {
    expect(isEventLiveNow('2026-08-01T08:00:00.000Z', '2026-08-01T10:00:00.000Z', NOW)).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('formats a multi-day countdown', () => {
    expect(formatCountdown('2026-08-04T12:00:00.000Z', NOW)).toBe('Starts in 3 days');
  });

  it('formats an hours-away countdown', () => {
    expect(formatCountdown('2026-08-01T15:00:00.000Z', NOW)).toBe('Starts in 3 hours');
  });

  it('formats a minutes-away countdown', () => {
    expect(formatCountdown('2026-08-01T12:12:00.000Z', NOW)).toBe('Starts in 12 minutes');
  });

  it('uses singular units for exactly 1', () => {
    expect(formatCountdown('2026-08-01T13:00:00.000Z', NOW)).toBe('Starts in 1 hour');
  });

  it('returns "Starting now" once begin_at has arrived, instead of a negative countdown', () => {
    expect(formatCountdown('2026-08-01T11:00:00.000Z', NOW)).toBe('Starting now');
  });

  it('returns "Unavailable" instead of "Invalid Date" for an unparsable begin_at', () => {
    expect(formatCountdown('not-a-date', NOW)).toBe('Unavailable');
  });
});
