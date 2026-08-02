import type { ClusterOccupancyResponse, ClusterSummary, ClusterWorkstation, RawLocation, StudentSummary } from '../models/types.js';
import { calculateSessionOverlapMs, normalizeLocationUser, type ReportingPeriod } from './weeklyCampusActivity.js';

/** Matches the leading letter(s)+digit(s) segment of a hostname (e.g. "c1" out of "c1r2p3",
 * "e2" out of "e2r6p10") - the de-facto cluster identifier on the 42 network. Hosts that don't
 * match this shape fall back to being their own single-workstation "cluster" (see
 * parseCluster()) rather than being dropped or guessed at. */
const CLUSTER_PREFIX_RE = /^([a-zA-Z]+\d+)/;

export function parseCluster(host: string): string {
  const match = CLUSTER_PREFIX_RE.exec(host);
  return match ? match[1]!.toUpperCase() : host;
}

interface HostStats {
  totalMs: number;
  sessionCount: number;
}

/** Per-host totals over `period`, from the same shape of location records already used for
 * Weekly Campus Activity - only the host key differs (workstation instead of student). */
export function aggregateHistoricalByHost(locations: RawLocation[], period: ReportingPeriod, now: Date): Map<string, HostStats> {
  const byHost = new Map<string, HostStats>();

  for (const location of locations) {
    if (typeof location?.id !== 'number' || !location.begin_at) continue;
    const host = typeof location.host === 'string' && location.host.length > 0 ? location.host : null;
    if (!host) continue;

    const overlapMs = calculateSessionOverlapMs(location.begin_at, location.end_at, period.start, period.end, now);
    if (overlapMs <= 0) continue;

    const existing = byHost.get(host);
    if (existing) {
      existing.totalMs += overlapMs;
      existing.sessionCount += 1;
    } else {
      byHost.set(host, { totalMs: overlapMs, sessionCount: 1 });
    }
  }

  return byHost;
}

export interface CoalitionRef {
  name: string;
  color: string | null;
}

export interface BuildClusterOccupancyParams {
  /** Currently-open sessions only (`filter[active]=true` / `end_at: null`). */
  activeLocations: RawLocation[];
  /** Sessions with `begin_at` in the trailing reporting period, for usage history. */
  historicalLocations: RawLocation[];
  validStudentIds: Set<number>;
  studentsById: Map<number, StudentSummary>;
  coalitionByUserId: Map<number, CoalitionRef>;
  campusId: number;
  cursusId: number;
  period: ReportingPeriod;
  now: Date;
  source: '42-api' | 'cache';
}

/**
 * Pure orchestrator: merges a live "who's on now" snapshot with a trailing-period usage
 * aggregate into per-cluster workstation grids. A workstation only ever appears here if it was
 * observed in real session data (currently occupied, or occupied at least once in `period») -
 * never a hardcoded seat list, since the 42 API exposes no hardware/capacity inventory.
 */
export function buildClusterOccupancy(params: BuildClusterOccupancyParams): ClusterOccupancyResponse {
  const { activeLocations, historicalLocations, validStudentIds, studentsById, coalitionByUserId, campusId, cursusId, now, source } = params;

  const historyByHost = aggregateHistoricalByHost(historicalLocations, params.period, now);
  const knownHosts = new Set<string>(historyByHost.keys());

  const occupiedByHost = new Map<string, RawLocation>();
  for (const location of activeLocations) {
    if (typeof location?.id !== 'number' || !location.begin_at || location.end_at) continue;
    const host = typeof location.host === 'string' && location.host.length > 0 ? location.host : null;
    if (!host) continue;

    // The seat itself is real/known regardless of who's on it; only roster-matched occupants
    // get their identity attached below (staff/other-campus/non-roster sessions show as an
    // unoccupied known seat rather than leaking a non-roster user's info).
    knownHosts.add(host);
    const userId = location.user?.id;
    if (typeof userId !== 'number' || !validStudentIds.has(userId)) continue;

    const existing = occupiedByHost.get(host);
    if (!existing || new Date(location.begin_at) < new Date(existing.begin_at)) {
      occupiedByHost.set(host, location);
    }
  }

  const workstations: ClusterWorkstation[] = [...knownHosts].sort().map((host) => {
    const activeLocation = occupiedByHost.get(host) ?? null;
    const hist = historyByHost.get(host);
    const activeUser = activeLocation ? normalizeLocationUser(activeLocation.user) : null;
    const summary = activeUser ? studentsById.get(activeUser.id) : undefined;

    const student = summary
      ? {
          id: summary.id,
          login: summary.login,
          displayName: summary.displayName,
          imageUrl: summary.imageUrl,
          level: summary.level,
          coalition: coalitionByUserId.get(summary.id) ?? null,
        }
      : null;

    return {
      host,
      cluster: parseCluster(host),
      occupied: student !== null,
      student,
      sessionMinutes:
        activeLocation && student ? Math.max(0, Math.round((now.getTime() - new Date(activeLocation.begin_at).getTime()) / 60_000)) : null,
      loginAt: student ? (activeLocation?.begin_at ?? null) : null,
      usageHoursLastWeek: hist ? Math.round((hist.totalMs / 3_600_000) * 10) / 10 : 0,
      sessionsLastWeek: hist?.sessionCount ?? 0,
    };
  });

  const byCluster = new Map<string, ClusterWorkstation[]>();
  for (const w of workstations) {
    const list = byCluster.get(w.cluster);
    if (list) list.push(w);
    else byCluster.set(w.cluster, [w]);
  }

  const clusters: ClusterSummary[] = [...byCluster.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cluster, ws]) => {
      const occupied = ws.filter((w) => w.occupied);
      const sessionMinutesList = occupied.map((w) => w.sessionMinutes ?? 0);
      const mostUsed = ws.reduce<ClusterWorkstation | null>(
        (best, w) => (!best || w.usageHoursLastWeek > best.usageHoursLastWeek ? w : best),
        null,
      );

      return {
        cluster,
        workstations: ws,
        occupiedCount: occupied.length,
        knownSeatCount: ws.length,
        averageSessionMinutes: average(sessionMinutesList),
        longestSessionMinutes: sessionMinutesList.length > 0 ? Math.max(...sessionMinutesList) : 0,
        mostUsedHost: mostUsed && mostUsed.usageHoursLastWeek > 0 ? mostUsed.host : null,
      };
    });

  const allOccupied = workstations.filter((w) => w.occupied);
  const mostOccupiedCluster = clusters.reduce<ClusterSummary | null>(
    (best, c) => (!best || c.occupiedCount > best.occupiedCount ? c : best),
    null,
  );
  const mostPopularComputer = workstations.reduce<ClusterWorkstation | null>(
    (best, w) => (!best || w.usageHoursLastWeek > best.usageHoursLastWeek ? w : best),
    null,
  );

  return {
    clusters,
    summary: {
      studentsOnline: allOccupied.length,
      knownSeatCount: workstations.length,
      mostOccupiedCluster: mostOccupiedCluster && mostOccupiedCluster.occupiedCount > 0 ? mostOccupiedCluster.cluster : null,
      mostPopularComputer: mostPopularComputer && mostPopularComputer.usageHoursLastWeek > 0 ? mostPopularComputer.host : null,
      averageSessionMinutes: average(allOccupied.map((w) => w.sessionMinutes ?? 0)),
    },
    meta: {
      campusId,
      cursusId,
      source,
      lastUpdated: now.toISOString(),
      limitation:
        'The 42 API exposes no per-cluster hardware/capacity inventory, so workstation totals reflect only seats observed in live or the last 7 days of session data - not true installed capacity. Unused or newly-added seats will not appear until occupied at least once.',
    },
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
