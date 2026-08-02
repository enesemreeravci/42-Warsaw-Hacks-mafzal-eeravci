import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Logger } from '../config/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Snapshots older than this are pruned on every append - comfortably longer than any period
 * this feature supports comparing against (see routes/coalitionContributors.ts). */
const MAX_RETENTION_DAYS = 120;

/** One point-in-time capture of every roster student's coalitions_users.score. This is the
 * only source of "points earned during period" for Weekly Top Coalition Contributors - the 42
 * API exposes no historical/delta endpoint for coalition score, so without accumulated
 * snapshots like this the feature has nothing to compute a real delta from (see
 * weeklyTopContributors.ts, which refuses to fabricate a ranking from current totals alone). */
export interface CoalitionScoreSnapshot {
  takenAt: string;
  /** userId (as a string, since JSON object keys are always strings) -> coalitions_users.score. */
  scores: Record<string, number>;
}

function isValidSnapshot(value: unknown): value is CoalitionScoreSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.takenAt === 'string' && typeof candidate.scores === 'object' && candidate.scores !== null;
}

/**
 * Append-only, file-backed time series of coalition score snapshots. No database in this
 * backend, so this is a deliberately simple JSON file rather than a bespoke binary format -
 * write volume is a few KB every few hours, never a hot path.
 */
export class CoalitionSnapshotStore {
  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {}

  /** Never throws: a missing or corrupt file degrades to "no history yet" rather than crashing
   * the feature (or, worse, the server). */
  async read(): Promise<CoalitionScoreSnapshot[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidSnapshot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      this.logger.warn({ err: error }, 'Coalition score snapshot file unreadable/corrupt; treating as empty history');
      return [];
    }
  }

  async append(scores: Map<number, number>, takenAt: Date): Promise<void> {
    const existing = await this.read();
    const cutoffMs = takenAt.getTime() - MAX_RETENTION_DAYS * DAY_MS;
    const pruned = existing.filter((s) => new Date(s.takenAt).getTime() >= cutoffMs);

    const scoresRecord: Record<string, number> = {};
    for (const [userId, score] of scores) scoresRecord[String(userId)] = score;
    pruned.push({ takenAt: takenAt.toISOString(), scores: scoresRecord });

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    // Write-then-rename instead of a direct write, so a crash mid-write can never leave behind
    // a truncated/corrupt snapshot file for the next read() to choke on.
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(pruned), 'utf-8');
    await fs.rename(tmpPath, this.filePath);
  }
}
