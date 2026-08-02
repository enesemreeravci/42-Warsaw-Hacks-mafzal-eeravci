import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type {
  ClusterOccupancyResponse,
  CoalitionStanding,
  EvaluationEntry,
  ProjectCompletion,
  RawBloc,
  RawCoalitionUser,
  RawCursusUser,
  RawEvent,
  RawLocation,
  RawProject,
  RawProjectUser,
  RawScaleTeam,
  StudentDetail,
  StudentSummary,
} from '../models/types.js';
import path from 'node:path';
import { TtlCache, type CacheGetResult } from '../utils/cache.js';
import { buildClusterOccupancy, type CoalitionRef } from './clusterOccupancy.js';
import { CoalitionSnapshotStore } from './coalitionSnapshotStore.js';
import { buildCoalitionStandings, buildTopContributors, buildWeeklyPointsByCoalition, buildWeeklyTopContributors } from './coalitions.js';
import { buildRecentEvaluations } from './evaluations.js';
import { buildUpcomingEvents, type CampusEvent } from './events.js';
import { isCurrentProject, normalizeProjectCompletion, normalizeStudentSummary, selectCursusRecord } from './normalize.js';
import type { DiscoveredConfig, DiscoveryService } from './discoveryService.js';
import type { Ft42ApiClient } from './ft42ApiClient.js';
import { buildReturningStudents, type ReturningSortOption, type ReturningStudentsResponse } from './returningStudents.js';
import {
  buildWeeklyCampusActivity,
  getLastSevenDaysRange,
  type ReportingPeriod,
  type WeeklyCampusActivityResponse,
} from './weeklyCampusActivity.js';
import {
  buildWeeklyContributorLeaderboard,
  type ContributorCoalitionRef,
  type WeeklyTopContributorsResponse,
} from './weeklyTopContributors.js';
import { dedupeById } from '../utils/dedupe.js';

export interface CurrentProjectRef {
  projectId: number;
  projectName: string;
  status: string;
}

export interface CoreDataset {
  students: StudentSummary[];
  completions: ProjectCompletion[];
  discovered: DiscoveredConfig;
  currentProjectsByStudent: Map<number, CurrentProjectRef[]>;
}

export interface ProjectListing {
  id: number;
  name: string;
}

type CacheStatus = 'fresh' | 'cached' | 'stale';

const DISCOVERY_KEY = 'discovery';
const ROSTER_KEY = 'roster';
const RECENT_PROJECT_USERS_KEY = 'recent-project-users';
const HISTORICAL_PROJECT_USERS_KEY = 'historical-project-users';
const PROJECTS_KEY = 'projects';
const COALITIONS_KEY = 'coalitions';
const SCALE_TEAMS_KEY = 'scale-teams';
const SCALE_TEAMS_PAGE_SIZE = 100;
// Matches the "Weekly XP race" window (dashboard.ts buildXpLeaderboard) so the coalition
// leaderboard's weekly spotlight and the TV-mode XP race agree on what "this week" means.
const WEEKLY_TOP_CONTRIBUTOR_DAYS = 7;

// /v2/projects_users for a campus/cursus this size is 100+ pages of full history (confirmed
// live: still returning full pages at page 100). Every *dashboard* route only ever displays a
// recent window anyway, so getCoreDataset() bounds itself to this many days via the API's own
// `range[updated_at]` filter (confirmed live to work) instead of paging through everything.
// getHistoricalCoreDataset() is the unbounded, accurate counterpart for pages that are worth
// waiting longer for (a deliberately-opened student profile), not for the auto-loading dashboard.
const RECENT_WINDOW_DAYS = 45;
const HISTORICAL_TTL_MS = 15 * 60 * 1000;
const EVAL_ANALYTICS_KEY = 'eval-analytics-scale-teams';
// 30 min: analytics data changes slowly; a longer TTL avoids hammering the 42 API
// every time the page is opened but still reflects same-day evaluation activity.
const EVAL_ANALYTICS_TTL_MS = 30 * 60 * 1000;
// 30 days covers the TASK.md date-range options (today through thisMonth).
const EVAL_ANALYTICS_WINDOW_DAYS = 30;
// Up to 30 pages × 100 records/page = up to 3000 filled scale_teams.
const EVAL_ANALYTICS_MAX_PAGES = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_EVENTS_KEY = 'upcoming-events';
const UPCOMING_EVENTS_LIMIT = 5;
const WEEKLY_CAMPUS_ACTIVITY_KEY = 'weekly-campus-activity';
// Weekly rankings don't meaningfully change minute-to-minute, so this is deliberately much
// longer than cacheTtlSeconds (the dashboard's default) - see getWeeklyCampusActivity().
const WEEKLY_ACTIVITY_TTL_MS = 45 * 60 * 1000;
// A week of `/v2/campus/:id/locations` for a campus this size is a few thousand records at
// most (page[size]=100) - generous headroom over what's actually expected, same spirit as the
// other maxPages bounds in this file.
const WEEKLY_ACTIVITY_LOCATIONS_MAX_PAGES = 100;

const CLUSTER_ACTIVE_KEY = 'cluster-active-locations';
// Live occupancy should feel close to real-time on a TV display, so this is much shorter than
// the other location-backed caches (WEEKLY_ACTIVITY_TTL_MS = 45min).
const CLUSTER_ACTIVE_TTL_MS = 30 * 1000;
const CLUSTER_HISTORY_KEY = 'cluster-history-locations';
// Usage history changes slowly - same cadence as Weekly Campus Activity.
const CLUSTER_HISTORY_TTL_MS = WEEKLY_ACTIVITY_TTL_MS;
const COALITION_MEMBERSHIP_KEY = 'coalition-membership';
const COALITION_MEMBERSHIP_TTL_MS = WEEKLY_ACTIVITY_TTL_MS;

const RETURNING_STUDENTS_KEY = 'returning-students-locations';
const RETURNING_STUDENTS_TTL_MS = WEEKLY_ACTIVITY_TTL_MS;
// Comfortably longer than the largest supported inactivity threshold (60 days) plus a reporting
// period, so a student's real "previous visit" is very unlikely to fall outside this fetch and
// get silently excluded (see returningStudents.ts's meta.limitation for what happens when it does).
const RETURNING_STUDENTS_LOOKBACK_DAYS = 75;
const RETURNING_STUDENTS_LOCATIONS_MAX_PAGES = 150;

const CONTRIBUTOR_COALITION_MAP_KEY = 'contributor-coalition-map';
const CONTRIBUTOR_COALITION_MAP_TTL_MS = WEEKLY_ACTIVITY_TTL_MS;
const DEFAULT_SNAPSHOT_FILE_PATH = path.join(process.cwd(), 'data', 'coalition-score-snapshots.json');

/**
 * Orchestrates live data loading, discovery, and caching against the 42 API. Every
 * route reads through this service so raw API shapes never leak past it.
 */
export class DataService {
  private readonly cache: TtlCache<unknown>;
  private readonly coalitionSnapshotStore: CoalitionSnapshotStore;

  constructor(
    config: Pick<AppConfig, 'cacheTtlSeconds'>,
    private readonly apiClient: Ft42ApiClient,
    private readonly discoveryService: DiscoveryService,
    private readonly logger: Logger,
    snapshotFilePath: string = DEFAULT_SNAPSHOT_FILE_PATH,
  ) {
    this.cache = new TtlCache(config.cacheTtlSeconds * 1000, logger);
    this.coalitionSnapshotStore = new CoalitionSnapshotStore(snapshotFilePath, logger);
  }

  async getDiscoveredConfig(): Promise<DiscoveredConfig> {
    const result = await this.cache.getOrLoad(DISCOVERY_KEY, () => this.discoveryService.discoverAll());
    return result.value as DiscoveredConfig;
  }

  /**
   * Fast path: roster + a bounded recent window of project completions (~10-20 42 API
   * requests instead of 100+). Used by every route the dashboard fetches on initial load.
   * `totalValidatedCompletions`/`completedProjects`-style figures built from this therefore
   * reflect the last `RECENT_WINDOW_DAYS` days, not true lifetime totals - see
   * `getHistoricalCoreDataset()` for the accurate, slower counterpart.
   */
  async getCoreDataset(): Promise<{ data: CoreDataset; cacheStatus: CacheStatus }> {
    const discovered = await this.getDiscoveredConfig();
    const roster = await this.loadWithStatus(ROSTER_KEY, () => this.loadRosterRaw(discovered));
    const recent = await this.loadWithStatus(RECENT_PROJECT_USERS_KEY, () => this.loadRecentProjectUsersRaw(discovered));

    const data = this.buildCoreDataset(discovered, roster.value.cursusUsers, recent.value, roster.value.activeSinceByUser);
    return { data, cacheStatus: this.combineStatus(roster.status, recent.status) };
  }

  /**
   * Slow path: roster + the full, unbounded project-completion history. Only ever called for
   * a single deliberately-opened student page or the (separately-navigated) full student list -
   * never as part of the auto-loading dashboard - so paying the ~100+ page cost is acceptable
   * there and gets a longer cache TTL to amortize it.
   */
  async getHistoricalCoreDataset(): Promise<{ data: CoreDataset; cacheStatus: CacheStatus }> {
    const discovered = await this.getDiscoveredConfig();
    const roster = await this.loadWithStatus(ROSTER_KEY, () => this.loadRosterRaw(discovered));
    const historical = await this.loadWithStatus(
      HISTORICAL_PROJECT_USERS_KEY,
      () => this.loadHistoricalProjectUsersRaw(discovered),
      HISTORICAL_TTL_MS,
    );

    const data = this.buildCoreDataset(discovered, roster.value.cursusUsers, historical.value, roster.value.activeSinceByUser);
    return { data, cacheStatus: this.combineStatus(roster.status, historical.status) };
  }

  async getProjects(): Promise<ProjectListing[]> {
    const result = await this.cache.getOrLoad(PROJECTS_KEY, async () => {
      const discovered = await this.getDiscoveredConfig();
      const raw = await this.apiClient.paginate<RawProject>(
        `/v2/cursus/${discovered.cursusId}/projects`,
        {},
        { pageSize: 100, maxPages: 20 },
      );
      return raw.map((p) => ({ id: p.id, name: p.name }));
    });
    return result.value as ProjectListing[];
  }

  /** Full, accurate history for one student - a deliberate navigation, so the slow path is fine. */
  async getStudentDetail(login: string): Promise<StudentDetail | null> {
    const { data } = await this.getHistoricalCoreDataset();
    return this.buildStudentDetailFrom(data, login);
  }

  private buildStudentDetailFrom(data: CoreDataset, login: string): StudentDetail | null {
    const student = data.students.find((s) => s.login.toLowerCase() === login.toLowerCase());
    if (!student) return null;

    const studentCompletions = data.completions
      .filter((c) => c.studentId === student.id)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

    return {
      ...student,
      currentProjects: data.currentProjectsByStudent.get(student.id) ?? [],
      completedProjects: studentCompletions.filter((c) => c.validated),
      recentCompletions: studentCompletions.slice(0, 10),
    };
  }

  /**
   * Cache-only counterpart to getCoreDataset(): never awaits a live 42 API call, so route
   * handlers can call this directly instead of going through the loader. Returns null only
   * when nothing has been cached yet (e.g. the brief window before the first background
   * refresh cycle completes) - background prewarming is what keeps this non-null in practice.
   */
  getCoreDatasetSnapshot(): { data: CoreDataset; cacheStatus: CacheStatus } | null {
    return this.readCoreSnapshot(RECENT_PROJECT_USERS_KEY);
  }

  /** Cache-only counterpart to getHistoricalCoreDataset() - see getCoreDatasetSnapshot(). */
  getHistoricalCoreDatasetSnapshot(): { data: CoreDataset; cacheStatus: CacheStatus } | null {
    return this.readCoreSnapshot(HISTORICAL_PROJECT_USERS_KEY);
  }

  /** Cache-only counterpart to getCoalitions() - see getCoreDatasetSnapshot(). */
  getCoalitionsSnapshot(): CoalitionStanding[] | null {
    const result = this.cache.get(COALITIONS_KEY) as CacheGetResult<CoalitionStanding[]> | undefined;
    return result ? result.value : null;
  }

  /** Cache-only counterpart to getRecentEvaluations() - see getCoreDatasetSnapshot(). */
  getEvaluationsSnapshot(limit: number): EvaluationEntry[] | null {
    const core = this.getCoreDatasetSnapshot();
    const scaleTeams = this.cache.get(SCALE_TEAMS_KEY) as CacheGetResult<RawScaleTeam[]> | undefined;
    if (!core || !scaleTeams) return null;

    const studentsByLogin = new Map(core.data.students.map((s) => [s.login.toLowerCase(), s]));
    return buildRecentEvaluations(scaleTeams.value, studentsByLogin, limit);
  }

  /**
   * Cache-only counterpart to getStudentDetail(). Prefers the historical (accurate, unbounded)
   * dataset; falls back to the fast/recent-window one if historical isn't cached yet, in which
   * case `partialHistory` tells the caller completedProjects only covers the recent window.
   * `status: 'warming'` means nothing at all has been cached yet.
   */
  getStudentDetailSnapshot(
    login: string,
  ): { status: 'warming' } | { status: 'ready'; detail: StudentDetail | null; cacheStatus: CacheStatus; partialHistory: boolean } {
    const historical = this.getHistoricalCoreDatasetSnapshot();
    const snapshot = historical ?? this.getCoreDatasetSnapshot();
    if (!snapshot) return { status: 'warming' };

    return {
      status: 'ready',
      detail: this.buildStudentDetailFrom(snapshot.data, login),
      cacheStatus: snapshot.cacheStatus,
      partialHistory: historical === null,
    };
  }

  /**
   * Cache-only counterpart to getHistoricalCoreDataset() for the paginated student list.
   * Prefers the historical (accurate, unbounded) dataset; falls back to the fast/recent-window
   * one if historical isn't cached yet, in which case `partialHistory` tells the caller
   * completed-project counts only cover the recent window. `status: 'warming'` means nothing at
   * all has been cached yet. Mirrors getStudentDetailSnapshot() - see there for the same pattern.
   */
  getStudentsListSnapshot():
    | { status: 'warming' }
    | { status: 'ready'; data: CoreDataset; cacheStatus: CacheStatus; partialHistory: boolean } {
    const historical = this.getHistoricalCoreDatasetSnapshot();
    const snapshot = historical ?? this.getCoreDatasetSnapshot();
    if (!snapshot) return { status: 'warming' };

    return { status: 'ready', data: snapshot.data, cacheStatus: snapshot.cacheStatus, partialHistory: historical === null };
  }

  private readCoreSnapshot(projectUsersKey: string): { data: CoreDataset; cacheStatus: CacheStatus } | null {
    const discovered = this.cache.get(DISCOVERY_KEY) as CacheGetResult<DiscoveredConfig> | undefined;
    const roster = this.cache.get(ROSTER_KEY) as
      | CacheGetResult<{ cursusUsers: RawCursusUser[]; activeSinceByUser: Map<number, string> }>
      | undefined;
    const projectUsers = this.cache.get(projectUsersKey) as CacheGetResult<RawProjectUser[]> | undefined;
    if (!discovered || !roster || !projectUsers) return null;

    const data = this.buildCoreDataset(discovered.value, roster.value.cursusUsers, projectUsers.value, roster.value.activeSinceByUser);
    const toStatus = (r: CacheGetResult<unknown>): CacheStatus => (r.status === 'stale' ? 'stale' : 'cached');
    const cacheStatus = this.combineStatus(this.combineStatus(toStatus(discovered), toStatus(roster)), toStatus(projectUsers));
    return { data, cacheStatus };
  }

  async getCoalitions(): Promise<CoalitionStanding[]> {
    const result = await this.cache.getOrLoad(COALITIONS_KEY, async () => {
      const discovered = await this.getDiscoveredConfig();
      // `/v2/coalitions?filter[campus_id]=` silently ignores the filter and returns every
      // campus's coalitions. `/v2/blocs` is genuinely scoped per campus/cursus and embeds
      // exactly that campus's coalitions - verified live against Warsaw, see docs/API_RESEARCH.md.
      const blocs = await this.apiClient.paginate<RawBloc>(
        '/v2/blocs',
        { 'filter[campus_id]': discovered.campusId, 'filter[cursus_id]': discovered.cursusId },
        { pageSize: 100, maxPages: 5 },
      );
      const raw = blocs.flatMap((bloc) => bloc.coalitions ?? []);

      // Reuses getCoreDataset()'s own cache - this only triggers a live fetch on the rare tick
      // where both entries expire at once, not on every getCoalitions() call.
      const { data } = await this.getCoreDataset();
      const studentsById = new Map(data.students.map((s) => [s.id, s]));
      const coalitionUsers = await this.loadCoalitionUsersForRoster(data.students.map((s) => s.id));
      const topContributors = buildTopContributors(coalitionUsers, studentsById);
      const weeklyTopContributors = buildWeeklyTopContributors(
        coalitionUsers,
        studentsById,
        data.completions,
        WEEKLY_TOP_CONTRIBUTOR_DAYS,
        new Date(),
      );
      const weeklyPointsByCoalition = buildWeeklyPointsByCoalition(
        coalitionUsers,
        studentsById,
        data.completions,
        WEEKLY_TOP_CONTRIBUTOR_DAYS,
        new Date(),
      );

      return buildCoalitionStandings(raw, topContributors, weeklyTopContributors, weeklyPointsByCoalition);
    });
    return result.value as CoalitionStanding[];
  }

  /**
   * Live "who's on which workstation" merged with a trailing-7-day usage aggregate, grouped by
   * cluster. See clusterOccupancy.ts's buildClusterOccupancy() for why there's no seat-capacity
   * figure anywhere in the response - the 42 API exposes no hardware/capacity inventory, so
   * every workstation shown here was actually observed in live or recent session data.
   */
  async getClusterOccupancy(): Promise<ClusterOccupancyResponse> {
    const discovered = await this.getDiscoveredConfig();
    const period = getLastSevenDaysRange(new Date());

    const [activeResult, historyResult, coreResult, membershipResult] = await Promise.all([
      this.loadWithStatus(CLUSTER_ACTIVE_KEY, () => this.loadActiveLocationsRaw(discovered), CLUSTER_ACTIVE_TTL_MS),
      this.loadWithStatus(CLUSTER_HISTORY_KEY, () => this.loadClusterHistoryLocationsRaw(discovered, period), CLUSTER_HISTORY_TTL_MS),
      this.getCoreDataset(),
      this.loadWithStatus(COALITION_MEMBERSHIP_KEY, () => this.loadCoalitionMembershipMap(discovered), COALITION_MEMBERSHIP_TTL_MS),
    ]);

    const { data } = coreResult;
    const studentsById = new Map(data.students.map((s) => [s.id, s]));
    const validStudentIds = new Set(data.students.map((s) => s.id));
    const overallStatus = this.combineStatus(
      this.combineStatus(activeResult.status, historyResult.status),
      this.combineStatus(coreResult.cacheStatus, membershipResult.status),
    );

    return buildClusterOccupancy({
      activeLocations: activeResult.value,
      historicalLocations: historyResult.value,
      validStudentIds,
      studentsById,
      coalitionByUserId: membershipResult.value,
      campusId: discovered.campusId,
      cursusId: discovered.cursusId,
      period,
      now: new Date(),
      source: overallStatus === 'stale' ? 'cache' : '42-api',
    });
  }

  /** Best-effort: an empty result degrades getClusterOccupancy() to "nobody known online" rather than failing it. */
  private async loadActiveLocationsRaw(discovered: DiscoveredConfig): Promise<RawLocation[]> {
    try {
      return await this.apiClient.paginate<RawLocation>(
        `/v2/campus/${discovered.campusId}/locations`,
        { 'filter[active]': true },
        { pageSize: 100, maxPages: 20 },
      );
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not fetch active campus locations for cluster occupancy');
      return [];
    }
  }

  /** Same endpoint/window as Weekly Campus Activity's own fetch, kept as a separate cache entry
   * (own key/TTL) rather than shared, matching this codebase's existing per-feature fetch
   * pattern (e.g. eval analytics has its own scale_teams fetch distinct from other routes). */
  private async loadClusterHistoryLocationsRaw(discovered: DiscoveredConfig, period: ReportingPeriod): Promise<RawLocation[]> {
    const rawLocations = await this.apiClient.paginate<RawLocation>(
      `/v2/campus/${discovered.campusId}/locations`,
      { 'range[begin_at]': `${period.start.toISOString()},${period.end.toISOString()}`, sort: 'begin_at' },
      { pageSize: 100, maxPages: WEEKLY_ACTIVITY_LOCATIONS_MAX_PAGES },
    );
    return dedupeById(rawLocations);
  }

  /** user_id -> coalition {name, color}, for tagging occupied seats. Reuses the same
   * blocs/coalitions_users fetch pattern as getCoalitions(), cached separately. */
  private async loadCoalitionMembershipMap(discovered: DiscoveredConfig): Promise<Map<number, CoalitionRef>> {
    const blocs = await this.apiClient.paginate<RawBloc>(
      '/v2/blocs',
      { 'filter[campus_id]': discovered.campusId, 'filter[cursus_id]': discovered.cursusId },
      { pageSize: 100, maxPages: 5 },
    );
    const coalitionById = new Map<number, CoalitionRef>();
    for (const bloc of blocs) {
      for (const coalition of bloc.coalitions ?? []) {
        coalitionById.set(coalition.id, { name: coalition.name, color: coalition.color ?? null });
      }
    }

    const { data } = await this.getCoreDataset();
    const coalitionUsers = await this.loadCoalitionUsersForRoster(data.students.map((s) => s.id));

    const membership = new Map<number, CoalitionRef>();
    for (const cu of coalitionUsers) {
      const ref = coalitionById.get(cu.coalition_id);
      if (ref) membership.set(cu.user_id, ref);
    }
    return membership;
  }

  /**
   * "Welcome Back": students whose latest session in `period` follows a gap of at least
   * `thresholdDays` since their previous one. See returningStudents.ts's buildReturningStudents()
   * for the classification logic and why a student can never be *fabricated* into this list -
   * only excluded when the data needed to confidently classify them isn't available.
   */
  async getReturningStudents(period: ReportingPeriod, thresholdDays: number, sort: ReturningSortOption): Promise<ReturningStudentsResponse> {
    const discovered = await this.getDiscoveredConfig();

    const [historyResult, coreResult, membershipResult] = await Promise.all([
      this.loadWithStatus(RETURNING_STUDENTS_KEY, () => this.loadReturningStudentsLocationsRaw(discovered), RETURNING_STUDENTS_TTL_MS),
      this.getCoreDataset(),
      this.loadWithStatus(COALITION_MEMBERSHIP_KEY, () => this.loadCoalitionMembershipMap(discovered), COALITION_MEMBERSHIP_TTL_MS),
    ]);

    const { data } = coreResult;
    const studentsById = new Map(data.students.map((s) => [s.id, s]));
    const validStudentIds = new Set(data.students.map((s) => s.id));
    const activeNowUserIds = new Set(data.students.filter((s) => s.activeSince !== null).map((s) => s.id));
    const overallStatus = this.combineStatus(this.combineStatus(historyResult.status, coreResult.cacheStatus), membershipResult.status);

    return buildReturningStudents({
      locations: historyResult.value,
      validStudentIds,
      studentsById,
      coalitionByUserId: membershipResult.value,
      activeNowUserIds,
      period,
      thresholdDays,
      sort,
      campusId: discovered.campusId,
      cursusId: discovered.cursusId,
      now: new Date(),
      source: overallStatus === 'stale' ? 'cache' : '42-api',
    });
  }

  private async loadReturningStudentsLocationsRaw(discovered: DiscoveredConfig): Promise<RawLocation[]> {
    const now = new Date();
    const start = new Date(now.getTime() - RETURNING_STUDENTS_LOOKBACK_DAYS * DAY_MS);
    const rawLocations = await this.apiClient.paginate<RawLocation>(
      `/v2/campus/${discovered.campusId}/locations`,
      { 'range[begin_at]': `${start.toISOString()},${now.toISOString()}`, sort: 'begin_at' },
      { pageSize: 100, maxPages: RETURNING_STUDENTS_LOCATIONS_MAX_PAGES },
    );
    return dedupeById(rawLocations);
  }

  /**
   * Records one point-in-time snapshot of every roster student's coalitions_users.score to
   * disk (see CoalitionSnapshotStore) - the only source of history Weekly Top Coalition
   * Contributors has to compute a real "points earned" delta from, since the 42 API itself
   * exposes no historical/delta endpoint for coalition score. Intended to be called
   * periodically by CoalitionSnapshotScheduler, not per-request.
   */
  async captureCoalitionScoreSnapshot(): Promise<void> {
    const { data } = await this.getCoreDataset();
    const validStudentIds = new Set(data.students.map((s) => s.id));
    const coalitionUsers = await this.loadCoalitionUsersForRoster(data.students.map((s) => s.id));

    const scores = new Map<number, number>();
    for (const cu of coalitionUsers) {
      if (validStudentIds.has(cu.user_id)) scores.set(cu.user_id, cu.score);
    }

    await this.coalitionSnapshotStore.append(scores, new Date());
    this.logger.info({ studentCount: scores.size }, 'Captured coalition score snapshot');
  }

  /**
   * "Weekly Top Coalition Contributors": ranks students by coalition points earned during
   * `periodDays`, computed strictly from the difference between two real snapshots - see
   * weeklyTopContributors.ts. Returns `available: false` rather than any ranking at all until
   * enough snapshot history exists.
   */
  async getWeeklyContributorLeaderboard(periodDays: number): Promise<WeeklyTopContributorsResponse> {
    const discovered = await this.getDiscoveredConfig();

    const [snapshots, coreResult, membershipResult] = await Promise.all([
      this.coalitionSnapshotStore.read(),
      this.getCoreDataset(),
      this.loadWithStatus(
        CONTRIBUTOR_COALITION_MAP_KEY,
        () => this.loadContributorCoalitionMap(discovered),
        CONTRIBUTOR_COALITION_MAP_TTL_MS,
      ),
    ]);

    const studentsById = new Map(coreResult.data.students.map((s) => [s.id, s]));

    return buildWeeklyContributorLeaderboard({
      snapshots,
      studentsById,
      coalitionByUserId: membershipResult.value,
      periodDays,
      now: new Date(),
      campusId: discovered.campusId,
      cursusId: discovered.cursusId,
    });
  }

  /** user_id -> {id, name, color} for the student's coalition. Same blocs/coalitions_users
   * fetch pattern as loadCoalitionMembershipMap(), kept separate (own cache key) because this
   * one also needs the coalition's own id (for the coalition-comparison rollup), which
   * CoalitionRef deliberately doesn't carry - not worth changing that shared, already-tested
   * shape for one caller. */
  private async loadContributorCoalitionMap(discovered: DiscoveredConfig): Promise<Map<number, ContributorCoalitionRef>> {
    const blocs = await this.apiClient.paginate<RawBloc>(
      '/v2/blocs',
      { 'filter[campus_id]': discovered.campusId, 'filter[cursus_id]': discovered.cursusId },
      { pageSize: 100, maxPages: 5 },
    );
    const coalitionById = new Map<number, ContributorCoalitionRef>();
    for (const bloc of blocs) {
      for (const coalition of bloc.coalitions ?? []) {
        coalitionById.set(coalition.id, { id: coalition.id, name: coalition.name, color: coalition.color ?? null });
      }
    }

    const { data } = await this.getCoreDataset();
    const coalitionUsers = await this.loadCoalitionUsersForRoster(data.students.map((s) => s.id));

    const membership = new Map<number, ContributorCoalitionRef>();
    for (const cu of coalitionUsers) {
      const ref = coalitionById.get(cu.coalition_id);
      if (ref) membership.set(cu.user_id, ref);
    }
    return membership;
  }

  /**
   * `/v2/coalitions_users` has no campus filter and coalitions are shared network-wide, so
   * `filter[coalition_id]=X` alone can return members from other campuses (confirmed live: a
   * sample under a Warsaw coalition_id included a rank-2 global score far above anything this
   * cursus/campus size would produce). `filter[user_id]` with a comma-separated list, scoped to
   * exactly this campus's own roster, is what's used instead - confirmed live to return only
   * the requested IDs. Batched at 100 IDs/request to stay well under typical query-string
   * length limits.
   */
  private async loadCoalitionUsersForRoster(userIds: number[]): Promise<RawCoalitionUser[]> {
    const CHUNK_SIZE = 100;
    const results: RawCoalitionUser[] = [];

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);
      const items = await this.apiClient.get<RawCoalitionUser[]>('/v2/coalitions_users', {
        'filter[user_id]': chunk.join(','),
        'page[size]': CHUNK_SIZE,
      });
      if (Array.isArray(items)) results.push(...items);
    }

    return results;
  }

  async getRecentEvaluations(limit: number): Promise<EvaluationEntry[]> {
    // Only needs login -> displayName/avatar - the fast roster-backed dataset is enough.
    const { data } = await this.getCoreDataset();
    const studentsByLogin = new Map(data.students.map((s) => [s.login.toLowerCase(), s]));

    const result = await this.cache.getOrLoad(SCALE_TEAMS_KEY, () => this.loadFilledScaleTeams());

    return buildRecentEvaluations(result.value as RawScaleTeam[], studentsByLogin, limit);
  }

  /**
   * `/v2/scale_teams?sort=-filled_at` does not put completed evaluations first: the API's
   * underlying descending sort treats `filled_at: null` (not-yet-completed evaluations) as
   * the highest value, so it sorts to the front. Verified live - page 1-3 (300 records) were
   * 100% unfilled before any completed evaluation appeared. Pages until enough *filled*
   * records are collected instead of assuming they're near the front.
   */
  private async loadFilledScaleTeams(): Promise<RawScaleTeam[]> {
    const discovered = await this.getDiscoveredConfig();
    const filled: RawScaleTeam[] = [];
    // Headroom above the largest `limit` GET /dashboard/evaluations accepts (see dashboard.ts) -
    // keep the two in sync. Pages of mostly-unfilled scale_teams (see comment above) make this
    // loop one of the slowest parts of the cold-start warmup cycle, so both are kept as small as
    // the route's contract allows rather than padded further "just in case".
    const targetFilled = 20;
    const maxPages = 10;

    for (let page = 1; page <= maxPages; page += 1) {
      const items = await this.apiClient.get<RawScaleTeam[]>('/v2/scale_teams', {
        'filter[campus_id]': discovered.campusId,
        sort: '-filled_at',
        'page[size]': SCALE_TEAMS_PAGE_SIZE,
        'page[number]': page,
      });

      if (!Array.isArray(items) || items.length === 0) break;
      filled.push(...items.filter((item) => item.filled_at !== null));

      if (filled.length >= targetFilled || items.length < SCALE_TEAMS_PAGE_SIZE) break;
    }

    return filled;
  }

  /**
   * Next `limit` upcoming (or currently live) Warsaw campus events, soonest first. Cached under
   * the default cacheTtlSeconds (420s / 7 minutes, same as every route reading through
   * DataService's cache that doesn't override it) rather than a longer custom TTL - the widget's
   * own "refresh every 5 minutes" auto-poll (DashboardStore's autoRefreshSeconds, a separate
   * config value, not a new timer) fires more often than this TTL expires, so most polls simply
   * confirm the cached listing hasn't gone stale rather than re-fetching, without ever going
   * *longer* than 7 minutes between genuinely fresh pulls. Like getWeeklyCampusActivity(),
   * deliberately not part of BackgroundRefreshService's 45s core cycle - event listings don't
   * need near-real-time warmth, and pre-warming this that often would only add load against the
   * shared rate limiter for no visible benefit.
   */
  async getUpcomingEvents(limit = UPCOMING_EVENTS_LIMIT): Promise<CampusEvent[]> {
    const result = await this.cache.getOrLoad(UPCOMING_EVENTS_KEY, () => this.loadUpcomingEventsRaw());
    return (result.value as CampusEvent[]).slice(0, limit);
  }

  private async loadUpcomingEventsRaw(): Promise<CampusEvent[]> {
    const discovered = await this.getDiscoveredConfig();
    const now = new Date();

    const raw = await this.apiClient.paginate<RawEvent>(
      `/v2/campus/${discovered.campusId}/events`,
      { 'filter[future]': true, sort: 'begin_at' },
      { pageSize: 100, maxPages: 10 },
    );

    // Cached at the full (un-limited) UPCOMING_EVENTS_LIMIT-independent set so a future caller
    // asking for a larger limit doesn't need a second live fetch - getUpcomingEvents() applies
    // its own `limit` on top of whatever's cached here.
    const events = buildUpcomingEvents(dedupeById(raw), now, 50);
    this.logger.info({ eventCount: events.length }, 'Loaded upcoming events from 42 API');
    return events;
  }

  /**
   * "Weekly Campus Activity": Most Campus Time + Most Sessions Started, trailing 7 days,
   * Warsaw main-cursus students only (see weeklyCampusActivity.ts for the filtering/ranking
   * logic itself). Cached for WEEKLY_ACTIVITY_TTL_MS and refreshed lazily on first request -
   * unlike getCoreDataset()/getCoalitions(), this is deliberately NOT part of
   * BackgroundRefreshService's 45s core cycle: at that cadence it would add real load fetching
   * a week of `/v2/campus/:id/locations` against the shared 42 API rate limit for zero benefit,
   * since the TTL - not the fetch frequency - is what actually bounds how often this re-fetches.
   * On upstream failure, falls back to the last cached result with `meta.source: 'cache'` and a
   * warning instead of failing the request, as long as something has been cached before.
   */
  async getWeeklyCampusActivity(): Promise<WeeklyCampusActivityResponse> {
    const discovered = await this.getDiscoveredConfig();
    const result = await this.loadWithStatus(
      WEEKLY_CAMPUS_ACTIVITY_KEY,
      () => this.loadWeeklyCampusActivityRaw(discovered),
      WEEKLY_ACTIVITY_TTL_MS,
    );

    if (result.status !== 'stale') return result.value;

    return {
      ...result.value,
      meta: {
        ...result.value.meta,
        source: 'cache',
        warning: 'Showing cached data because live data is unavailable',
      },
    };
  }

  private async loadWeeklyCampusActivityRaw(discovered: DiscoveredConfig): Promise<WeeklyCampusActivityResponse> {
    const now = new Date();
    const period = getLastSevenDaysRange(now);

    // Reuses the same ROSTER_KEY cache entry getCoreDataset()/getHistoricalCoreDataset()
    // populate, instead of a second live /v2/cursus_users fetch for the same roster.
    const roster = await this.loadWithStatus(ROSTER_KEY, () => this.loadRosterRaw(discovered));

    const rawLocations = await this.apiClient.paginate<RawLocation>(
      `/v2/campus/${discovered.campusId}/locations`,
      {
        'range[begin_at]': `${period.start.toISOString()},${period.end.toISOString()}`,
        sort: 'begin_at',
      },
      { pageSize: 100, maxPages: WEEKLY_ACTIVITY_LOCATIONS_MAX_PAGES },
    );
    const locations = dedupeById(rawLocations);

    const response = buildWeeklyCampusActivity({
      cursusUsers: roster.value.cursusUsers,
      locations,
      campusId: discovered.campusId,
      cursusId: discovered.cursusId,
      period,
      now,
    });

    this.logger.info(
      {
        locationRecordsFetched: rawLocations.length,
        locationRecordsProcessed: response.summary.locationRecordsProcessed,
        uniqueActiveStudents: response.summary.uniqueActiveStudents,
      },
      'Loaded weekly campus activity from 42 API',
    );

    return response;
  }

  /**
   * Returns raw scale_team + student data for the evaluation analytics page.
   * On first call, fetches up to EVAL_ANALYTICS_MAX_PAGES of filled evaluations
   * from the 42 API (using `range[filled_at]` to bound to the last 30 days).
   * Subsequent calls within EVAL_ANALYTICS_TTL_MS serve from cache.
   * Follows the same lazy-load pattern as getWeeklyCampusActivity().
   */
  async getEvalAnalyticsData(): Promise<{ scaleTeams: RawScaleTeam[]; students: StudentSummary[] }> {
    const [teamsResult, coreResult] = await Promise.all([
      this.loadWithStatus(EVAL_ANALYTICS_KEY, () => this.loadEvalAnalyticsScaleTeams(), EVAL_ANALYTICS_TTL_MS),
      this.getCoreDataset(),
    ]);
    return { scaleTeams: teamsResult.value as RawScaleTeam[], students: coreResult.data.students };
  }

  /**
   * Fetches completed scale_teams for the last EVAL_ANALYTICS_WINDOW_DAYS days using
   * the 42 API's `range[filled_at]` parameter (confirmed to be a real, filterable field
   * on /v2/scale_teams - analogous to `range[updated_at]` used on projects_users).
   */
  private async loadEvalAnalyticsScaleTeams(): Promise<RawScaleTeam[]> {
    const discovered = await this.getDiscoveredConfig();
    const now = new Date();
    const from = new Date(now.getTime() - EVAL_ANALYTICS_WINDOW_DAYS * DAY_MS);

    const items = await this.apiClient.paginate<RawScaleTeam>(
      '/v2/scale_teams',
      {
        'filter[campus_id]': discovered.campusId,
        'range[filled_at]': `${from.toISOString()},${now.toISOString()}`,
        sort: '-filled_at',
      },
      { pageSize: 100, maxPages: EVAL_ANALYTICS_MAX_PAGES },
    );

    const filled = items.filter((item) => item.filled_at !== null);
    this.logger.info(
      { count: filled.length, windowDays: EVAL_ANALYTICS_WINDOW_DAYS },
      'Loaded evaluation analytics scale teams from 42 API',
    );
    return filled;
  }

  invalidateAll(): void {
    this.cache.invalidateAll();
  }

  /** Loads through `cache.getOrLoad` and reports fresh/cached/stale relative to *this* key. */
  private async loadWithStatus<T>(key: string, loader: () => Promise<T>, ttlMs?: number): Promise<{ value: T; status: CacheStatus }> {
    const cachedBefore = this.cache.get(key);
    const result: CacheGetResult<unknown> = await this.cache.getOrLoad(key, loader, ttlMs);
    const status: CacheStatus = result.status === 'stale' ? 'stale' : cachedBefore ? 'cached' : 'fresh';
    return { value: result.value as T, status };
  }

  private combineStatus(a: CacheStatus, b: CacheStatus): CacheStatus {
    if (a === 'stale' || b === 'stale') return 'stale';
    if (a === 'cached' || b === 'cached') return 'cached';
    return 'fresh';
  }

  private async loadRosterRaw(discovered: DiscoveredConfig): Promise<{ cursusUsers: RawCursusUser[]; activeSinceByUser: Map<number, string> }> {
    const cursusUsers = await this.apiClient.paginate<RawCursusUser>(
      '/v2/cursus_users',
      { 'filter[campus_id]': discovered.campusId, 'filter[cursus_id]': discovered.cursusId },
      { pageSize: 100, maxPages: 50 },
    );
    const activeSinceByUser = await this.loadActiveSessionsByUser(this.apiClient, discovered.campusId);
    this.logger.info({ studentCount: cursusUsers.length }, 'Loaded roster from 42 API');
    return { cursusUsers, activeSinceByUser };
  }

  private async loadRecentProjectUsersRaw(discovered: DiscoveredConfig): Promise<RawProjectUser[]> {
    const now = new Date();
    const since = new Date(now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // /v2/projects_users does not accept campus_id/cursus_id filters (confirmed live: the
    // API returns a 400 "Filter Error" naming its actual filterable attributes) - it wants
    // the un-suffixed campus/cursus instead. `range[updated_at]` is a real, verified-live
    // 42 API capability that bounds this to a handful of pages instead of full history.
    const items = await this.apiClient.paginate<RawProjectUser>(
      '/v2/projects_users',
      {
        'filter[campus]': discovered.campusId,
        'filter[cursus]': discovered.cursusId,
        'range[updated_at]': `${since.toISOString()},${now.toISOString()}`,
      },
      { pageSize: 100, maxPages: 20 },
    );
    this.logger.info({ completionCount: items.length, windowDays: RECENT_WINDOW_DAYS }, 'Loaded recent project completions from 42 API');
    return items;
  }

  private async loadHistoricalProjectUsersRaw(discovered: DiscoveredConfig): Promise<RawProjectUser[]> {
    const items = await this.apiClient.paginate<RawProjectUser>(
      '/v2/projects_users',
      { 'filter[campus]': discovered.campusId, 'filter[cursus]': discovered.cursusId },
      { pageSize: 100, maxPages: 150 },
    );
    this.logger.info({ completionCount: items.length }, 'Loaded full historical project completions from 42 API');
    return items;
  }

  private buildCoreDataset(
    discovered: DiscoveredConfig,
    cursusUsers: RawCursusUser[],
    projectUsers: RawProjectUser[],
    activeSinceByUser: Map<number, string>,
  ): CoreDataset {
    const completionsByStudent = new Map<number, ProjectCompletion[]>();
    const completions: ProjectCompletion[] = [];
    for (const raw of projectUsers) {
      const normalized = normalizeProjectCompletion(raw);
      if (!normalized) continue;
      completions.push(normalized);
      const list = completionsByStudent.get(normalized.studentId) ?? [];
      list.push(normalized);
      completionsByStudent.set(normalized.studentId, list);
    }

    const currentProjectsByStudent = new Map<number, CurrentProjectRef[]>();
    for (const raw of projectUsers) {
      if (isCurrentProject(raw) && raw.user && raw.project) {
        const list = currentProjectsByStudent.get(raw.user.id) ?? [];
        list.push({ projectId: raw.project.id, projectName: raw.project.name, status: raw.status ?? 'in_progress' });
        currentProjectsByStudent.set(raw.user.id, list);
      }
    }

    // Group cursus_user records by user.id and apply selectCursusRecord so that students who
    // have multiple cursus records (e.g. a re-enrolment after subscription reset) produce only
    // one StudentSummary entry. selectCursusRecord prefers active records, then most-recently
    // updated, then highest id — deterministic per TASK.md §6.2.
    const cursusUsersByUserId = new Map<number, RawCursusUser[]>();
    for (const cu of cursusUsers) {
      if (!cu.user) continue;
      const list = cursusUsersByUserId.get(cu.user.id) ?? [];
      list.push(cu);
      cursusUsersByUserId.set(cu.user.id, list);
    }

    const students: StudentSummary[] = [];
    for (const [, records] of cursusUsersByUserId) {
      const best = selectCursusRecord(records);
      if (!best || !best.user) continue;
      students.push(
        normalizeStudentSummary({
          user: best.user,
          cursusUser: best,
          campusName: discovered.campusName,
          cursusName: discovered.cursusName,
          completedProjects: completionsByStudent.get(best.user.id) ?? [],
          currentProjectCount: currentProjectsByStudent.get(best.user.id)?.length ?? 0,
          activeSince: activeSinceByUser.get(best.user.id) ?? null,
        }),
      );
    }

    return { students, completions, discovered, currentProjectsByStudent };
  }

  /**
   * Best-effort fetch of who is currently logged in on campus, for the "Hive" live map.
   * The 42 API application may not have location read access, or the endpoint may be
   * temporarily unavailable - either way this must never break the rest of the dashboard.
   */
  private async loadActiveSessionsByUser(apiClient: Ft42ApiClient, campusId: number): Promise<Map<number, string>> {
    try {
      const locations = await apiClient.paginate<RawLocation>(
        `/v2/campus/${campusId}/locations`,
        { 'filter[active]': true },
        { pageSize: 100, maxPages: 20 },
      );

      const byUser = new Map<number, string>();
      for (const location of locations) {
        if (!location.user || location.end_at) continue;
        const existing = byUser.get(location.user.id);
        if (!existing || new Date(location.begin_at) < new Date(existing)) {
          byUser.set(location.user.id, location.begin_at);
        }
      }
      if (byUser.size === 0) {
        this.logger.info('Live API connected: 0 active users currently on campus');
      }
      return byUser;
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not fetch active campus locations; Hive mode will show no live sessions');
      return new Map();
    }
  }
}
