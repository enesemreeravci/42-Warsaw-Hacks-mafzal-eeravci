import type { EvaluationEntry, RawScaleTeam, StudentSummary } from '../models/types.js';

/**
 * Maps a raw scale_team record to the public, low-sensitivity shape shown on the dashboard.
 * `comment`/`feedback` are never read here - `RawScaleTeam` doesn't even declare them (see
 * docs/LIMITATIONS.md) - only the corrected student, project (best-effort), pass/fail flag,
 * and final mark are surfaced.
 */
export function normalizeEvaluation(raw: RawScaleTeam, studentsByLogin: Map<string, StudentSummary>): EvaluationEntry | null {
  const corrected = raw.correcteds?.[0];
  if (!corrected || !raw.filled_at) return null;

  const student = studentsByLogin.get(corrected.login.toLowerCase());

  return {
    id: raw.id,
    correctedLogin: corrected.login,
    correctedDisplayName: student?.displayName ?? corrected.login,
    correctedImageUrl: student?.imageUrl ?? null,
    projectName: raw.team?.name ?? null,
    finalMark: raw.final_mark,
    flagName: raw.flag?.name ?? null,
    flagPositive: raw.flag?.positive ?? null,
    filledAt: raw.filled_at,
  };
}

/** Filters to completed evaluations (skips pending/no-show records) and normalizes each. */
export function buildRecentEvaluations(
  raw: RawScaleTeam[],
  studentsByLogin: Map<string, StudentSummary>,
  limit: number,
): EvaluationEntry[] {
  return raw
    .filter((r) => r.filled_at !== null)
    .map((r) => normalizeEvaluation(r, studentsByLogin))
    .filter((e): e is EvaluationEntry => e !== null)
    .sort((a, b) => new Date(b.filledAt).getTime() - new Date(a.filledAt).getTime())
    .slice(0, limit);
}
