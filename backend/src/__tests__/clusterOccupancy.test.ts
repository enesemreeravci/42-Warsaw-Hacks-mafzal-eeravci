import { describe, expect, it } from 'vitest';
import { aggregateHistoricalByHost, buildClusterOccupancy, parseCluster, type CoalitionRef } from '../services/clusterOccupancy.js';
import type { RawLocation, RawUser, StudentSummary } from '../models/types.js';

const NOW = new Date('2026-07-31T12:00:00.000Z');
const RANGE_START = new Date('2026-07-24T12:00:00.000Z');
const RANGE_END = NOW;
const PERIOD = { start: RANGE_START, end: RANGE_END };
const CAMPUS_ID = 67;
const CURSUS_ID = 21;

function fakeUser(overrides: Partial<RawUser> & { id: number }): RawUser {
  return { login: `student${overrides.id}`, ...overrides };
}

function fakeLocation(overrides: Partial<RawLocation> & { id: number; user?: RawUser }): RawLocation {
  return {
    begin_at: '2026-07-30T08:00:00.000Z',
    end_at: '2026-07-30T10:00:00.000Z',
    campus_id: CAMPUS_ID,
    host: 'c1r1p1',
    ...overrides,
  };
}

function fakeStudent(overrides: Partial<StudentSummary> & { id: number }): StudentSummary {
  return {
    login: `student${overrides.id}`,
    displayName: `Student ${overrides.id}`,
    imageUrl: null,
    level: 5,
    correctionPoints: 0,
    wallet: 0,
    active: true,
    campusName: 'Warsaw',
    cursusName: '42cursus',
    completedProjectCount: 0,
    currentProjectCount: 0,
    lastCompletionDate: null,
    lastCompletedProject: null,
    activeSince: null,
    blackholedAt: null,
    ...overrides,
  };
}

describe('parseCluster', () => {
  it('extracts the leading letter+digit prefix as the cluster id', () => {
    expect(parseCluster('c1r2p3')).toBe('C1');
    expect(parseCluster('e2r6p10')).toBe('E2');
  });

  it('falls back to the full host when no cluster prefix pattern matches', () => {
    expect(parseCluster('unusual-host-name')).toBe('unusual-host-name');
  });
});

describe('aggregateHistoricalByHost', () => {
  it('sums duration and session count per host', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, host: 'c1r1p1', begin_at: '2026-07-30T08:00:00.000Z', end_at: '2026-07-30T09:00:00.000Z' }),
      fakeLocation({ id: 2, host: 'c1r1p1', begin_at: '2026-07-30T10:00:00.000Z', end_at: '2026-07-30T11:00:00.000Z' }),
      fakeLocation({ id: 3, host: 'c1r1p2', begin_at: '2026-07-30T08:00:00.000Z', end_at: '2026-07-30T08:30:00.000Z' }),
    ];

    const result = aggregateHistoricalByHost(locations, PERIOD, NOW);

    expect(result.get('c1r1p1')).toEqual({ totalMs: 2 * 60 * 60 * 1000, sessionCount: 2 });
    expect(result.get('c1r1p2')).toEqual({ totalMs: 30 * 60 * 1000, sessionCount: 1 });
  });

  it('skips records with no host, no id, or no begin_at', () => {
    const locations: RawLocation[] = [
      fakeLocation({ id: 1, host: undefined }),
      { id: 2, begin_at: '', end_at: null, host: 'c1r1p1' } as RawLocation,
    ];
    expect(aggregateHistoricalByHost(locations, PERIOD, NOW).size).toBe(0);
  });

  it('returns an empty map for empty input', () => {
    expect(aggregateHistoricalByHost([], PERIOD, NOW).size).toBe(0);
  });
});

describe('buildClusterOccupancy', () => {
  const studentsById = new Map([
    [1, fakeStudent({ id: 1, login: 'eeravci', level: 9.42 })],
    [2, fakeStudent({ id: 2, login: 'other' })],
  ]);
  const validStudentIds = new Set([1, 2]);
  const coalitionByUserId = new Map<number, CoalitionRef>([[1, { name: 'Freax', color: '#fff' }]]);

  it('marks a currently-active, roster-matched location as occupied with student + coalition info', () => {
    const activeLocations: RawLocation[] = [
      fakeLocation({ id: 1, host: 'c1r1p1', user: fakeUser({ id: 1 }), begin_at: '2026-07-31T10:00:00.000Z', end_at: null }),
    ];

    const result = buildClusterOccupancy({
      activeLocations,
      historicalLocations: [],
      validStudentIds,
      studentsById,
      coalitionByUserId,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
      period: PERIOD,
      now: NOW,
      source: '42-api',
    });

    expect(result.clusters).toHaveLength(1);
    const workstation = result.clusters[0]!.workstations[0]!;
    expect(workstation).toMatchObject({
      host: 'c1r1p1',
      cluster: 'C1',
      occupied: true,
      sessionMinutes: 120, // 10:00 -> now (12:00)
    });
    expect(workstation.student).toEqual({
      id: 1,
      login: 'eeravci',
      displayName: 'Student 1',
      imageUrl: null,
      level: 9.42,
      coalition: { name: 'Freax', color: '#fff' },
    });
    expect(result.summary.studentsOnline).toBe(1);
  });

  it('excludes an active session for a user not in the campus roster', () => {
    const activeLocations: RawLocation[] = [
      fakeLocation({ id: 1, host: 'c1r1p1', user: fakeUser({ id: 999 }), end_at: null }),
    ];

    const result = buildClusterOccupancy({
      activeLocations,
      historicalLocations: [],
      validStudentIds,
      studentsById,
      coalitionByUserId,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
      period: PERIOD,
      now: NOW,
      source: '42-api',
    });

    // The host is still "known" (it appeared in a real record) but not occupied by a valid student.
    expect(result.clusters[0]!.workstations[0]).toMatchObject({ occupied: false, student: null });
    expect(result.summary.studentsOnline).toBe(0);
  });

  it('includes a host from historical-only data as a known-but-unoccupied seat', () => {
    const historicalLocations: RawLocation[] = [
      fakeLocation({ id: 1, host: 'c2r1p1', user: fakeUser({ id: 1 }), begin_at: '2026-07-29T08:00:00.000Z', end_at: '2026-07-29T09:00:00.000Z' }),
    ];

    const result = buildClusterOccupancy({
      activeLocations: [],
      historicalLocations,
      validStudentIds,
      studentsById,
      coalitionByUserId,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
      period: PERIOD,
      now: NOW,
      source: '42-api',
    });

    const workstation = result.clusters[0]!.workstations[0]!;
    expect(workstation).toMatchObject({ host: 'c2r1p1', occupied: false, usageHoursLastWeek: 1, sessionsLastWeek: 1 });
  });

  it('groups workstations by parsed cluster prefix', () => {
    const activeLocations: RawLocation[] = [
      fakeLocation({ id: 1, host: 'c1r1p1', user: fakeUser({ id: 1 }), end_at: null }),
      fakeLocation({ id: 2, host: 'c1r1p2', user: fakeUser({ id: 2 }), end_at: null }),
      fakeLocation({ id: 3, host: 'c2r1p1', user: fakeUser({ id: 1 }), end_at: null }),
    ];
    // Two of these share user id 1 concurrently, which can't really happen live, but the builder
    // doesn't need to police that - it only needs to prove cluster grouping works per-host.

    const result = buildClusterOccupancy({
      activeLocations,
      historicalLocations: [],
      validStudentIds,
      studentsById,
      coalitionByUserId,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
      period: PERIOD,
      now: NOW,
      source: '42-api',
    });

    expect(result.clusters.map((c) => c.cluster)).toEqual(['C1', 'C2']);
    expect(result.clusters[0]!.workstations).toHaveLength(2);
    expect(result.clusters[0]!.occupiedCount).toBe(2);
  });

  it('never fabricates a seat total - knownSeatCount only reflects observed hosts', () => {
    const result = buildClusterOccupancy({
      activeLocations: [],
      historicalLocations: [],
      validStudentIds,
      studentsById,
      coalitionByUserId,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
      period: PERIOD,
      now: NOW,
      source: '42-api',
    });

    expect(result.clusters).toEqual([]);
    expect(result.summary.knownSeatCount).toBe(0);
    expect(result.summary.studentsOnline).toBe(0);
    expect(result.meta.limitation).toMatch(/no per-cluster hardware/);
  });

  it('computes mostOccupiedCluster and mostPopularComputer from real data', () => {
    const activeLocations: RawLocation[] = [
      fakeLocation({ id: 1, host: 'c1r1p1', user: fakeUser({ id: 1 }), end_at: null }),
      fakeLocation({ id: 2, host: 'c1r1p2', user: fakeUser({ id: 2 }), end_at: null }),
    ];
    const historicalLocations: RawLocation[] = [
      fakeLocation({ id: 3, host: 'c1r1p2', user: fakeUser({ id: 2 }), begin_at: '2026-07-29T08:00:00.000Z', end_at: '2026-07-29T14:00:00.000Z' }),
    ];

    const result = buildClusterOccupancy({
      activeLocations,
      historicalLocations,
      validStudentIds,
      studentsById,
      coalitionByUserId,
      campusId: CAMPUS_ID,
      cursusId: CURSUS_ID,
      period: PERIOD,
      now: NOW,
      source: '42-api',
    });

    expect(result.summary.mostOccupiedCluster).toBe('C1');
    expect(result.summary.mostPopularComputer).toBe('c1r1p2');
  });
});
