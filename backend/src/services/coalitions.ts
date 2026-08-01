import type {
  CoalitionStanding,
  CoalitionTopContributor,
  CoalitionWeeklyContributor,
  ProjectCompletion,
  RawCoalition,
  RawCoalitionUser,
  StudentSummary,
} from '../models/types.js';
import { computeWeeklyXpByStudent } from './livePulse.js';

/**
 * Reduces `coalitions_users` records down to one top scorer per `coalition_id`, restricted to
 * students present in `studentsById` (the campus roster) - that restriction is what keeps
 * results scoped to this campus, since the raw records themselves carry no campus information.
 */
export function buildTopContributors(
  coalitionUsers: RawCoalitionUser[],
  studentsById: Map<number, StudentSummary>,
): Map<number, CoalitionTopContributor> {
  const best = new Map<number, CoalitionTopContributor>();
  for (const cu of coalitionUsers) {
    const student = studentsById.get(cu.user_id);
    if (!student) continue;

    const current = best.get(cu.coalition_id);
    if (!current || cu.score > current.score) {
      best.set(cu.coalition_id, {
        id: student.id,
        login: student.login,
        displayName: student.displayName,
        imageUrl: student.imageUrl,
        score: cu.score,
      });
    }
  }
  return best;
}

/**
 * Same per-coalition "best member" reduction as buildTopContributors(), but ranked by
 * `weeklyPoints` (validated-completion marks in the trailing `days` window, via
 * computeWeeklyXpByStudent) instead of all-time coalition score. A member with zero validated
 * completions this week is never selected, even if they're the coalition's all-time leader -
 * that's what keeps this a genuine "who's active right now" signal rather than a repeat of
 * buildTopContributors().
 */
export function buildWeeklyTopContributors(
  coalitionUsers: RawCoalitionUser[],
  studentsById: Map<number, StudentSummary>,
  completions: ProjectCompletion[],
  days: number,
  referenceDate: Date,
): Map<number, CoalitionWeeklyContributor> {
  const weeklyByStudent = computeWeeklyXpByStudent(completions, days, referenceDate);
  const best = new Map<number, CoalitionWeeklyContributor>();

  for (const cu of coalitionUsers) {
    const student = studentsById.get(cu.user_id);
    if (!student) continue;

    const weekly = weeklyByStudent.get(cu.user_id);
    if (!weekly || weekly.weeklyXp <= 0) continue;

    const current = best.get(cu.coalition_id);
    if (!current || weekly.weeklyXp > current.weeklyPoints) {
      best.set(cu.coalition_id, {
        id: student.id,
        login: student.login,
        displayName: student.displayName,
        imageUrl: student.imageUrl,
        weeklyPoints: weekly.weeklyXp,
      });
    }
  }
  return best;
}

/** Sorts coalitions by score descending and assigns 1-based ranks. */
export function buildCoalitionStandings(
  raw: RawCoalition[],
  topContributors: Map<number, CoalitionTopContributor> = new Map(),
  weeklyTopContributors: Map<number, CoalitionWeeklyContributor> = new Map(),
): CoalitionStanding[] {
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
      topContributor: topContributors.get(coalition.id) ?? null,
      weeklyTopContributor: weeklyTopContributors.get(coalition.id) ?? null,
    }));
}
