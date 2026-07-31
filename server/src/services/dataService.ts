import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type {
  CoalitionStanding,
  EvaluationEntry,
  ProjectCompletion,
  RawBloc,
  RawCoalitionUser,
  RawCursusUser,
  RawLocation,
  RawProject,
  RawProjectUser,
  RawScaleTeam,
  StudentDetail,
  StudentSummary,
} from '../models/types.js';
import { TtlCache, type CacheGetResult } from '../utils/cache.js';
import { buildCoalitionStandings, buildTopContributors } from './coalitions.js';
import { buildRecentEvaluations } from './evaluations.js';
import { isCurrentProject, normalizeProjectCompletion, normalizeStudentSummary } from './normalize.js';
import type { DiscoveredConfig, DiscoveryService } from './discoveryService.js';
import type { Ft42ApiClient } from './ft42ApiClient.js';

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

// /v2/projects_users for a campus/cursus this size is 100+ pages of full history (confirmed
// live: still returning full pages at page 100). Every *dashboard* route only ever displays a
// recent window anyway, so getCoreDataset() bounds itself to this many days via the API's own
// `range[updated_at]` filter (confirmed live to work) instead of paging through everything.
// getHistoricalCoreDataset() is the unbounded, accurate counterpart for pages that are worth
// waiting longer for (a deliberately-opened student profile), not for the auto-loading dashboard.
const RECENT_WINDOW_DAYS = 45;
const HISTORICAL_TTL_MS = 15 * 60 * 1000;

/**
 * Orchestrates live data loading, discovery, and caching against the 42 API. Every
 * route reads through this service so raw API shapes never leak past it.
 */
export class DataService {
  private readonly cache: TtlCache<unknown>;

  constructor(
    config: Pick<AppConfig, 'cacheTtlSeconds'>,
    private readonly apiClient: Ft42ApiClient,
    private readonly discoveryService: DiscoveryService,
    private readonly logger: Logger,
  ) {
    this.cache = new TtlCache(config.cacheTtlSeconds * 1000, logger);
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

      return buildCoalitionStandings(raw, topContributors);
    });
    return result.value as CoalitionStanding[];
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
    const targetFilled = 50; // headroom above the largest `limit` any route accepts
    const maxPages = 20;

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

    const students: StudentSummary[] = cursusUsers
      .filter((cu) => cu.user)
      .map((cu) =>
        normalizeStudentSummary({
          user: cu.user!,
          cursusUser: cu,
          campusName: discovered.campusName,
          cursusName: discovered.cursusName,
          completedProjects: completionsByStudent.get(cu.user!.id) ?? [],
          currentProjectCount: currentProjectsByStudent.get(cu.user!.id)?.length ?? 0,
          activeSince: activeSinceByUser.get(cu.user!.id) ?? null,
        }),
      );

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
