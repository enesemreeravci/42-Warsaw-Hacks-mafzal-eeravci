import type { RawEvent } from '../models/types.js';

const DEFAULT_LIMIT = 5;

/** Public, normalized shape for one upcoming campus event. */
export interface CampusEvent {
  id: number;
  name: string;
  description: string | null;
  location: string | null;
  beginAt: string;
  endAt: string;
  participants: number;
  /** null means the event has no registered capacity limit. */
  maxParticipants: number | null;
  /** null when maxParticipants is null (uncapped) - there's no "remaining" concept to report. */
  availableSpots: number | null;
  kind: string;
  themes: string[];
}

function normalizeThemes(themes: RawEvent['themes']): string[] {
  if (!Array.isArray(themes)) return [];
  return themes
    .map((theme) => (typeof theme === 'string' ? theme : theme?.name))
    .filter((theme): theme is string => typeof theme === 'string' && theme.trim().length > 0);
}

/** Maps one raw `/v2/campus/:id/events` record to the public shape. Returns null for a record
 * missing the fields the widget can't render without (id, name, begin_at, end_at) instead of
 * throwing, so one malformed event can't take the whole widget down. */
export function normalizeEvent(raw: RawEvent): CampusEvent | null {
  if (typeof raw?.id !== 'number' || !raw.name || !raw.begin_at || !raw.end_at) return null;

  const maxParticipants = typeof raw.max_people === 'number' ? raw.max_people : null;
  const participants = typeof raw.nbr_subscribers === 'number' ? raw.nbr_subscribers : 0;

  return {
    id: raw.id,
    name: raw.name,
    description: raw.description?.trim() || null,
    location: raw.location?.trim() || null,
    beginAt: raw.begin_at,
    endAt: raw.end_at,
    participants,
    maxParticipants,
    availableSpots: maxParticipants !== null ? Math.max(0, maxParticipants - participants) : null,
    kind: raw.kind?.trim() || 'event',
    themes: normalizeThemes(raw.themes),
  };
}

/**
 * Normalizes raw event records, drops anything already fully in the past (defense-in-depth -
 * the caller already requests `filter[future]=true`, but that's evaluated at 42-API-server time,
 * not this request's `now`), sorts by start time ascending, and returns the next `limit`.
 */
export function buildUpcomingEvents(raw: RawEvent[], now: Date, limit = DEFAULT_LIMIT): CampusEvent[] {
  return raw
    .map(normalizeEvent)
    .filter((event): event is CampusEvent => event !== null)
    .filter((event) => new Date(event.endAt).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.beginAt).getTime() - new Date(b.beginAt).getTime())
    .slice(0, limit);
}
