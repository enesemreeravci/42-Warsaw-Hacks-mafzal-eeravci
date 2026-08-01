import { describe, expect, it } from 'vitest';
import { buildUpcomingEvents, normalizeEvent } from '../services/events.js';
import type { RawEvent } from '../models/types.js';

const NOW = new Date('2026-07-31T12:00:00.000Z');

function fakeEvent(overrides: Partial<RawEvent> & { id: number }): RawEvent {
  return {
    name: `Event ${overrides.id}`,
    begin_at: '2026-08-01T10:00:00.000Z',
    end_at: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeEvent', () => {
  it('maps every field to the expected public shape', () => {
    const raw = fakeEvent({
      id: 1,
      name: 'AI Workshop',
      description: '  Learn the basics of AI.  ',
      location: 'Social Space',
      kind: 'workshop',
      max_people: 50,
      nbr_subscribers: 32,
      themes: ['AI', { name: 'Programming' }],
    });

    expect(normalizeEvent(raw)).toEqual({
      id: 1,
      name: 'AI Workshop',
      description: 'Learn the basics of AI.',
      location: 'Social Space',
      beginAt: '2026-08-01T10:00:00.000Z',
      endAt: '2026-08-01T12:00:00.000Z',
      participants: 32,
      maxParticipants: 50,
      availableSpots: 18,
      kind: 'workshop',
      themes: ['AI', 'Programming'],
    });
  });

  it('returns null for a record missing id, name, begin_at, or end_at', () => {
    expect(normalizeEvent({ id: 1, name: '', begin_at: 'x', end_at: 'y' })).toBeNull();
    expect(normalizeEvent({ id: 1, name: 'ok', begin_at: '', end_at: 'y' } as RawEvent)).toBeNull();
    expect(normalizeEvent({ name: 'ok', begin_at: 'x', end_at: 'y' } as unknown as RawEvent)).toBeNull();
  });

  it('treats an uncapped event (no max_people) as availableSpots: null, not 0 or negative', () => {
    const raw = fakeEvent({ id: 1, max_people: null, nbr_subscribers: 10 });
    const event = normalizeEvent(raw);
    expect(event?.maxParticipants).toBeNull();
    expect(event?.availableSpots).toBeNull();
  });

  it('clamps availableSpots to 0 instead of going negative when oversubscribed', () => {
    const raw = fakeEvent({ id: 1, max_people: 10, nbr_subscribers: 15 });
    expect(normalizeEvent(raw)?.availableSpots).toBe(0);
  });

  it('defaults kind to "event" and themes to [] when absent', () => {
    const raw = fakeEvent({ id: 1, kind: null, themes: null });
    const event = normalizeEvent(raw);
    expect(event?.kind).toBe('event');
    expect(event?.themes).toEqual([]);
  });

  it('defaults description/location to null instead of an empty string', () => {
    const raw = fakeEvent({ id: 1, description: '   ', location: undefined });
    const event = normalizeEvent(raw);
    expect(event?.description).toBeNull();
    expect(event?.location).toBeNull();
  });
});

describe('buildUpcomingEvents', () => {
  it('sorts by begin_at ascending regardless of input order', () => {
    const raw: RawEvent[] = [
      fakeEvent({ id: 1, begin_at: '2026-08-03T10:00:00.000Z', end_at: '2026-08-03T12:00:00.000Z' }),
      fakeEvent({ id: 2, begin_at: '2026-08-01T10:00:00.000Z', end_at: '2026-08-01T12:00:00.000Z' }),
    ];

    const events = buildUpcomingEvents(raw, NOW);

    expect(events.map((e) => e.id)).toEqual([2, 1]);
  });

  it('excludes events that have already fully ended relative to "now"', () => {
    const raw: RawEvent[] = [
      fakeEvent({ id: 1, begin_at: '2026-07-01T10:00:00.000Z', end_at: '2026-07-01T12:00:00.000Z' }), // long over
      fakeEvent({ id: 2, begin_at: '2026-08-01T10:00:00.000Z', end_at: '2026-08-01T12:00:00.000Z' }),
    ];

    const events = buildUpcomingEvents(raw, NOW);

    expect(events.map((e) => e.id)).toEqual([2]);
  });

  it('keeps a currently-live event (begin_at in the past, end_at in the future)', () => {
    const raw: RawEvent[] = [fakeEvent({ id: 1, begin_at: '2026-07-31T11:00:00.000Z', end_at: '2026-07-31T13:00:00.000Z' })];
    expect(buildUpcomingEvents(raw, NOW)).toHaveLength(1);
  });

  it('skips malformed records without throwing', () => {
    const raw = [fakeEvent({ id: 1 }), { id: 2, name: '', begin_at: '', end_at: '' } as RawEvent];
    expect(buildUpcomingEvents(raw, NOW)).toHaveLength(1);
  });

  it('limits to the requested count', () => {
    const raw: RawEvent[] = Array.from({ length: 8 }, (_, i) =>
      fakeEvent({ id: i, begin_at: `2026-08-0${i + 1}T10:00:00.000Z`, end_at: `2026-08-0${i + 1}T12:00:00.000Z` }),
    );
    expect(buildUpcomingEvents(raw, NOW, 5)).toHaveLength(5);
  });

  it('returns an empty array for empty input', () => {
    expect(buildUpcomingEvents([], NOW)).toEqual([]);
  });
});
