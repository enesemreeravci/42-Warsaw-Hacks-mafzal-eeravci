import { describe, expect, it } from 'vitest';
import { buildCoalitionStandings } from '../services/coalitions.js';
import type { RawCoalition } from '../models/types.js';

describe('buildCoalitionStandings', () => {
  it('sorts by score descending and assigns 1-based ranks', () => {
    const raw: RawCoalition[] = [
      { id: 1, name: 'A', slug: 'a', score: 100 },
      { id: 2, name: 'B', slug: 'b', score: 300 },
      { id: 3, name: 'C', slug: 'c', score: 200 },
    ];

    const standings = buildCoalitionStandings(raw);

    expect(standings.map((s) => s.id)).toEqual([2, 3, 1]);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it('treats a missing score as 0 rather than crashing', () => {
    const raw: RawCoalition[] = [{ id: 1, name: 'A', slug: 'a' }];
    const standings = buildCoalitionStandings(raw);
    expect(standings[0]!.score).toBe(0);
  });

  it('maps image_url/color with null fallbacks', () => {
    const raw: RawCoalition[] = [{ id: 1, name: 'A', slug: 'a', score: 10, image_url: 'https://x', color: '#fff' }];
    const [standing] = buildCoalitionStandings(raw);
    expect(standing).toMatchObject({ imageUrl: 'https://x', color: '#fff' });
  });

  it('returns an empty array for empty input', () => {
    expect(buildCoalitionStandings([])).toEqual([]);
  });
});
