import type { StudentSummary } from '../models/types.js';
import type { CoalitionScoreSnapshot } from './coalitionSnapshotStore.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ContributorCoalitionRef {
  id: number;
  name: string;
  color: string | null;
}

export interface WeeklyContributorEntry {
  rank: number;
  userId: number;
  login: string;
  displayName: string;
  imageUrl: string | null;
  level: number;
  coalition: ContributorCoalitionRef | null;
  pointsEarned: number;
  /** Null when there isn't yet a second period of history to compare against. */
  previousRank: number | null;
  /** Positive = moved up that many places; negative = moved down; null = unknown (see previousRank). */
  rankChange: number | null;
}

export interface CoalitionPointsGained {
  coalitionId: number;
  name: string;
  color: string | null;
  pointsGained: number;
}

export interface WeeklyTopContributorsSummary {
  topContributor: { login: string; displayName: string; pointsEarned: number } | null;
  mostActiveCoalition: { name: string; pointsGained: number } | null;
  totalPointsEarned: number;
  activeContributors: number;
}

export interface WeeklyTopContributorsResponse {
  /** False until at least one snapshot older than `periodDays` exists - see the class doc
   * comment on CoalitionSnapshotStore. Never fabricated from current totals when false. */
  available: boolean;
  message: string | null;
  periodDays: number;
  generatedAt: string;
  contributors: WeeklyContributorEntry[];
  coalitionComparison: CoalitionPointsGained[];
  summary: WeeklyTopContributorsSummary;
  meta: {
    campusId: number;
    cursusId: number;
    snapshotCount: number;
    oldestSnapshotAt: string | null;
  };
}

const NOT_AVAILABLE_MESSAGE =
  'Weekly contribution data is not available yet. Historical snapshots are required before contributor rankings can be calculated accurately.';

export interface BuildWeeklyTopContributorsParams {
  snapshots: CoalitionScoreSnapshot[];
  studentsById: Map<number, StudentSummary>;
  coalitionByUserId: Map<number, ContributorCoalitionRef>;
  periodDays: number;
  now: Date;
  campusId: number;
  cursusId: number;
}

/** The most recent snapshot at or before `targetMs`, from a list already sorted ascending by takenAt. */
function findSnapshotAtOrBefore(sorted: CoalitionScoreSnapshot[], targetMs: number): CoalitionScoreSnapshot | null {
  let result: CoalitionScoreSnapshot | null = null;
  for (const snap of sorted) {
    if (new Date(snap.takenAt).getTime() <= targetMs) result = snap;
    else break;
  }
  return result;
}

/** Ranks every roster student's score delta between `baseline` and `latest`, filtered to
 * strictly positive gains (this is a "highest weekly contribution" leaderboard, not a general
 * score-change report) and roster-matched, baseline-matched students only. */
function rankContributors(
  baseline: CoalitionScoreSnapshot,
  latest: CoalitionScoreSnapshot,
  studentsById: Map<number, StudentSummary>,
): Array<{ userId: number; pointsEarned: number }> {
  const ranked: Array<{ userId: number; pointsEarned: number; login: string }> = [];

  for (const [userIdStr, currentScore] of Object.entries(latest.scores)) {
    const baselineScore = baseline.scores[userIdStr];
    if (baselineScore === undefined) continue; // no baseline for this student - never fabricated

    const userId = Number(userIdStr);
    const summary = studentsById.get(userId);
    if (!summary) continue; // not a current roster student (left campus/cursus, staff, etc.)

    const pointsEarned = currentScore - baselineScore;
    if (pointsEarned <= 0) continue;

    ranked.push({ userId, pointsEarned, login: summary.login });
  }

  ranked.sort((a, b) => b.pointsEarned - a.pointsEarned || a.login.localeCompare(b.login));
  return ranked;
}

/**
 * Pure orchestrator. Never estimates a contribution from current totals - every figure here
 * comes from the difference between two real, previously-recorded snapshots. Returns
 * `available: false` (with the required user-facing message) until enough snapshot history has
 * accumulated to compute even one real delta.
 */
export function buildWeeklyContributorLeaderboard(params: BuildWeeklyTopContributorsParams): WeeklyTopContributorsResponse {
  const { snapshots, studentsById, coalitionByUserId, periodDays, now, campusId, cursusId } = params;

  const sorted = [...snapshots].sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime());
  const meta = { campusId, cursusId, snapshotCount: sorted.length, oldestSnapshotAt: sorted[0]?.takenAt ?? null };

  const notAvailable = (): WeeklyTopContributorsResponse => ({
    available: false,
    message: NOT_AVAILABLE_MESSAGE,
    periodDays,
    generatedAt: now.toISOString(),
    contributors: [],
    coalitionComparison: [],
    summary: { topContributor: null, mostActiveCoalition: null, totalPointsEarned: 0, activeContributors: 0 },
    meta,
  });

  if (sorted.length === 0) return notAvailable();

  const latest = sorted[sorted.length - 1]!;
  const baseline = findSnapshotAtOrBefore(sorted, now.getTime() - periodDays * DAY_MS);
  if (!baseline || baseline === latest) return notAvailable();

  const ranked = rankContributors(baseline, latest, studentsById);

  const contributors: WeeklyContributorEntry[] = ranked.map((r, index) => {
    const summary = studentsById.get(r.userId)!;
    return {
      rank: index + 1,
      userId: r.userId,
      login: summary.login,
      displayName: summary.displayName,
      imageUrl: summary.imageUrl,
      level: summary.level,
      coalition: coalitionByUserId.get(r.userId) ?? null,
      pointsEarned: r.pointsEarned,
      previousRank: null,
      rankChange: null,
    };
  });

  // Rank change vs. the period before this one, if a third data point that far back exists.
  const priorBaseline = findSnapshotAtOrBefore(sorted, now.getTime() - 2 * periodDays * DAY_MS);
  if (priorBaseline && priorBaseline !== baseline) {
    const priorRanked = rankContributors(priorBaseline, baseline, studentsById);
    const previousRankByUser = new Map(priorRanked.map((r, index) => [r.userId, index + 1]));
    for (const c of contributors) {
      const previousRank = previousRankByUser.get(c.userId) ?? null;
      c.previousRank = previousRank;
      c.rankChange = previousRank !== null ? previousRank - c.rank : null;
    }
  }

  const coalitionTotals = new Map<number, CoalitionPointsGained>();
  for (const c of contributors) {
    if (!c.coalition) continue;
    const existing = coalitionTotals.get(c.coalition.id);
    if (existing) existing.pointsGained += c.pointsEarned;
    else coalitionTotals.set(c.coalition.id, { coalitionId: c.coalition.id, name: c.coalition.name, color: c.coalition.color, pointsGained: c.pointsEarned });
  }
  const coalitionComparison = [...coalitionTotals.values()].sort((a, b) => b.pointsGained - a.pointsGained);

  const totalPointsEarned = contributors.reduce((sum, c) => sum + c.pointsEarned, 0);
  const topContributor = contributors[0]
    ? { login: contributors[0].login, displayName: contributors[0].displayName, pointsEarned: contributors[0].pointsEarned }
    : null;
  const mostActiveCoalition = coalitionComparison[0]
    ? { name: coalitionComparison[0].name, pointsGained: coalitionComparison[0].pointsGained }
    : null;

  return {
    available: true,
    message: null,
    periodDays,
    generatedAt: now.toISOString(),
    contributors,
    coalitionComparison,
    summary: { topContributor, mostActiveCoalition, totalPointsEarned, activeContributors: contributors.length },
    meta,
  };
}
