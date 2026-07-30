import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import { generateMockDataset } from '../mock/mockData.js';
import type {
  ProjectCompletion,
  RawCursusUser,
  RawLocation,
  RawProject,
  RawProjectUser,
  StudentDetail,
  StudentSummary,
} from '../models/types.js';
import { TtlCache } from '../utils/cache.js';
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

const CORE_DATA_KEY = 'core-dataset';
const DISCOVERY_KEY = 'discovery';
const PROJECTS_KEY = 'projects';

/**
 * Orchestrates live-vs-mock data loading, discovery, and caching. Every
 * route reads through this service so raw API shapes never leak past it.
 */
export class DataService {
  private readonly cache: TtlCache<unknown>;
  private readonly mockDataset: ReturnType<typeof generateMockDataset> | null;

  constructor(
    private readonly config: Pick<AppConfig, 'mockMode' | 'featuredLogin' | 'cacheTtlSeconds' | 'requestConcurrency'>,
    private readonly apiClient: Ft42ApiClient | null,
    private readonly discoveryService: DiscoveryService | null,
    private readonly logger: Logger,
  ) {
    this.cache = new TtlCache(config.cacheTtlSeconds * 1000);
    this.mockDataset = config.mockMode ? generateMockDataset(config.featuredLogin) : null;
  }

  isMockMode(): boolean {
    return this.config.mockMode;
  }

  async getDiscoveredConfig(): Promise<DiscoveredConfig> {
    if (this.config.mockMode) {
      return { campusId: 0, campusName: 'Warsaw (demo)', cursusId: 0, cursusName: '42cursus (demo)' };
    }
    const result = await this.cache.getOrLoad(DISCOVERY_KEY, () => this.discoveryService!.discoverAll());
    return result.value as DiscoveredConfig;
  }

  async getCoreDataset(): Promise<{ data: CoreDataset; cacheStatus: 'fresh' | 'cached' | 'stale' }> {
    if (this.config.mockMode) {
      return {
        data: {
          students: this.mockDataset!.students,
          completions: this.mockDataset!.completions,
          discovered: { campusId: 0, campusName: 'Warsaw (demo)', cursusId: 0, cursusName: '42cursus (demo)' },
          currentProjectsByStudent: this.mockDataset!.currentProjectsByStudent,
        },
        cacheStatus: 'fresh',
      };
    }

    const cachedBefore = this.cache.get(CORE_DATA_KEY);
    const result = await this.cache.getOrLoad(CORE_DATA_KEY, () => this.loadLiveCoreDataset());
    const cacheStatus = result.status === 'stale' ? 'stale' : cachedBefore ? 'cached' : 'fresh';
    return { data: result.value as CoreDataset, cacheStatus };
  }

  async getProjects(): Promise<ProjectListing[]> {
    if (this.config.mockMode) {
      return this.mockDataset!.projectNames.map((name, idx) => ({ id: idx + 1, name }));
    }

    const result = await this.cache.getOrLoad(PROJECTS_KEY, async () => {
      const discovered = await this.getDiscoveredConfig();
      const raw = await this.apiClient!.paginate<RawProject>(
        `/v2/cursus/${discovered.cursusId}/projects`,
        {},
        { pageSize: 100, maxPages: 20 },
      );
      return raw.map((p) => ({ id: p.id, name: p.name }));
    });
    return result.value as ProjectListing[];
  }

  async getStudentDetail(login: string): Promise<StudentDetail | null> {
    const { data } = await this.getCoreDataset();
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

  invalidateAll(): void {
    this.cache.invalidateAll();
  }

  private async loadLiveCoreDataset(): Promise<CoreDataset> {
    const discovered = await this.getDiscoveredConfig();
    const apiClient = this.apiClient!;

    const [cursusUsers, projectUsers, activeSinceByUser] = await Promise.all([
      apiClient.paginate<RawCursusUser>(
        '/v2/cursus_users',
        { 'filter[campus_id]': discovered.campusId, 'filter[cursus_id]': discovered.cursusId },
        { pageSize: 100, maxPages: 50 },
      ),
      apiClient.paginate<RawProjectUser>(
        '/v2/projects_users',
        { 'filter[campus_id]': discovered.campusId, 'filter[cursus_id]': discovered.cursusId },
        { pageSize: 100, maxPages: 100 },
      ),
      this.loadActiveSessionsByUser(apiClient, discovered.campusId),
    ]);

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

    this.logger.info({ studentCount: students.length, completionCount: completions.length }, 'Loaded live core dataset from 42 API');

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
      return byUser;
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not fetch active campus locations; Hive mode will show no live sessions');
      return new Map();
    }
  }
}
