import { Pipe, PipeTransform } from '@angular/core';

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
];

/** Formats an ISO timestamp as "3 minutes ago" - used throughout the dashboard for completions/refresh times. */
@Pipe({ name: 'relativeTime', standalone: true, pure: false })
export class RelativeTimePipe implements PipeTransform {
  private readonly formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  transform(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '—';

    const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
    const absSeconds = Math.abs(diffSeconds);

    for (const [unit, secondsInUnit] of UNITS) {
      if (absSeconds >= secondsInUnit || unit === 'second') {
        const value = Math.round(diffSeconds / secondsInUnit);
        return this.formatter.format(value, unit);
      }
    }
    return this.formatter.format(diffSeconds, 'second');
  }
}
