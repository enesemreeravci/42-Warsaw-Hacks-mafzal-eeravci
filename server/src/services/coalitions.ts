import type { CoalitionStanding, RawCoalition } from '../models/types.js';

/** Sorts coalitions by score descending and assigns 1-based ranks. */
export function buildCoalitionStandings(raw: RawCoalition[]): CoalitionStanding[] {
  return [...raw]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((coalition, index) => ({
      id: coalition.id,
      name: coalition.name,
      slug: coalition.slug,
      imageUrl: coalition.image_url ?? null,
      color: coalition.color ?? null,
      score: coalition.score ?? 0,
      rank: index + 1,
    }));
}
