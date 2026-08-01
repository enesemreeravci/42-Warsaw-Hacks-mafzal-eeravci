import { formatMinutesAsHoursAndMinutes, formatWarsawDateRange, formatWarsawTime } from './weekly-campus-activity.utils';

describe('formatMinutesAsHoursAndMinutes', () => {
  it('formats whole hours and minutes', () => {
    expect(formatMinutesAsHoursAndMinutes(150)).toBe('2h 30m');
  });

  it('formats zero minutes', () => {
    expect(formatMinutesAsHoursAndMinutes(0)).toBe('0h 0m');
  });

  it('never renders NaN or a negative value for invalid input', () => {
    expect(formatMinutesAsHoursAndMinutes(Number.NaN)).toBe('0h 0m');
    expect(formatMinutesAsHoursAndMinutes(-45)).toBe('0h 0m');
  });
});

describe('formatWarsawTime', () => {
  it('formats an ISO timestamp as HH:mm', () => {
    expect(formatWarsawTime('2026-07-31T12:00:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('returns "Unavailable" instead of "Invalid Date" for missing/unparsable input', () => {
    expect(formatWarsawTime(null)).toBe('Unavailable');
    expect(formatWarsawTime(undefined)).toBe('Unavailable');
    expect(formatWarsawTime('not-a-date')).toBe('Unavailable');
  });
});

describe('formatWarsawDateRange', () => {
  it('formats a start/end pair as a short date range', () => {
    expect(formatWarsawDateRange('2026-07-24T12:00:00.000Z', '2026-07-31T12:00:00.000Z')).toMatch(/\d{2} \w{3} - \d{2} \w{3}/);
  });

  it('returns "Unavailable" instead of "Invalid Date" for missing/unparsable input', () => {
    expect(formatWarsawDateRange(null, null)).toBe('Unavailable');
    expect(formatWarsawDateRange('not-a-date', '2026-07-31T12:00:00.000Z')).toBe('Unavailable');
  });
});
