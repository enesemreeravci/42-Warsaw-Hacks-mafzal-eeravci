import { RelativeTimePipe } from './relative-time.pipe';

describe('RelativeTimePipe', () => {
  const pipe = new RelativeTimePipe();

  it('returns an em dash for null/undefined input', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
  });

  it('returns an em dash for an unparsable date', () => {
    expect(pipe.transform('not-a-date')).toBe('—');
  });

  it('formats a timestamp a few minutes in the past', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(pipe.transform(fiveMinutesAgo)).toMatch(/minute/);
  });

  it('formats a timestamp about a day in the past', () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(pipe.transform(yesterday)).toMatch(/day|yesterday/);
  });
});
