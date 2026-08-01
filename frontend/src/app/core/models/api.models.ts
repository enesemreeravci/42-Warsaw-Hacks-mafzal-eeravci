export interface StudentSummary {
  id: number;
  login: string;
  displayName: string;
  imageUrl: string | null;
  level: number;
  correctionPoints: number;
  wallet: number;
  active: boolean;
  campusName: string;
  cursusName: string;
  completedProjectCount: number;
  currentProjectCount: number;
  lastCompletionDate: string | null;
  lastCompletedProject: string | null;
  activeSince: string | null;
  blackholedAt: string | null;
}

/** A currently-active on-campus session, for the "Hive" live node map. */
export interface ActiveSessionEntry {
  id: number;
  login: string;
  displayName: string;
  imageUrl: string | null;
  level: number;
  activeSince: string;
  sessionMinutes: number;
}

/** Weekly XP leaderboard entry. `weeklyXp` is a proxy metric (sum of final marks on
 * validated completions in the window), not official 42 XP/transactions data. */
export interface XpLeaderboardEntry {
  id: number;
  login: string;
  displayName: string;
  imageUrl: string | null;
  weeklyXp: number;
}

/** A student with an upcoming black hole date, soonest first. */
export interface BlackHoleWatchEntry {
  id: number;
  login: string;
  displayName: string;
  imageUrl: string | null;
  blackholedAt: string;
  daysRemaining: number;
}

/** A recent validated completion, flagged for the full-screen takeover when the mark is exceptional. */
export interface AchievementEntry extends ProjectCompletion {
  isTakeover: boolean;
}

export interface LivePulseResponse {
  activeNow: ActiveSessionEntry[];
  xpLeaderboard: XpLeaderboardEntry[];
  blackHoleWatch: BlackHoleWatchEntry[];
  achievements: AchievementEntry[];
}

/** The campus's single highest-scoring member of a given coalition. */
export interface CoalitionTopContributor {
  id: number;
  login: string;
  displayName: string;
  imageUrl: string | null;
  score: number;
}

/** The campus's top scorer within a given coalition over the trailing 7 days - `weeklyPoints`
 * is the same "sum of final marks on validated completions" proxy metric as the Weekly XP race,
 * not official 42 XP (see docs/LIMITATIONS.md). */
export interface CoalitionWeeklyContributor {
  id: number;
  login: string;
  displayName: string;
  imageUrl: string | null;
  weeklyPoints: number;
}

/** A coalition's standing on the campus leaderboard. */
export interface CoalitionStanding {
  id: number;
  name: string;
  slug: string;
  imageUrl: string | null;
  color: string | null;
  score: number;
  rank: number;
  /** Null if no campus roster member could be matched against this coalition's membership. */
  topContributor: CoalitionTopContributor | null;
  /** Null if no campus roster member of this coalition had any validated completions in the
   * trailing 7 days. */
  weeklyTopContributor: CoalitionWeeklyContributor | null;
}

/** A recently-filled peer evaluation. `comment`/`feedback` are never fetched by the backend - see docs/LIMITATIONS.md. */
export interface EvaluationEntry {
  id: number;
  correctedLogin: string;
  correctedDisplayName: string;
  correctedImageUrl: string | null;
  projectName: string | null;
  finalMark: number | null;
  flagName: string | null;
  flagPositive: boolean | null;
  filledAt: string;
}

export interface StudentDetail extends StudentSummary {
  currentProjects: Array<{ projectId: number; projectName: string; status: string }>;
  completedProjects: ProjectCompletion[];
  recentCompletions: ProjectCompletion[];
}

export interface ProjectCompletion {
  projectUserId: number;
  studentId: number;
  login: string;
  displayName: string;
  imageUrl: string | null;
  projectId: number;
  projectName: string;
  finalMark: number | null;
  validated: boolean;
  status: string;
  completedAt: string;
}

export interface ProjectMetric {
  projectId: number;
  projectName: string;
  completionCount: number;
  successfulCompletionCount: number;
  failedCompletionCount: number;
  averageFinalMark: number;
  successRate: number;
}

export type CacheStatus = 'fresh' | 'cached' | 'stale';

export interface DashboardSummary {
  totalStudents: number;
  activeStudents: number;
  averageLevel: number;
  completionsLast7Days: number;
  completionsLast30Days: number;
  totalValidatedCompletions: number;
  /** Distinct projects with at least one finished attempt in the loaded window - not the full
   * curriculum catalog, just what this cohort has actually engaged with. */
  totalEnrolledProjects: number;
  /** Validated / finished attempts, as a percentage, across the same window. */
  averageCompletionRate: number;
  latestCompletionAt: string | null;
  generatedAt: string;
  cacheStatus: CacheStatus;
}

export interface CompletionTrendPoint {
  date: string;
  count: number;
}

export interface StudentRanking extends StudentSummary {
  recentCompletionCount?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ProjectListing {
  id: number;
  name: string;
}

export interface AppConfigResponse {
  campus: { id: number; name: string };
  cursus: { id: number; name: string };
  featuredLogin: string;
  autoRefreshSeconds: number;
  cacheTtlSeconds: number;
}

export interface HealthResponse {
  status: string;
  serverTime: string;
  uptimeSeconds: number;
  cacheAvailable: boolean;
  authReady: boolean;
}

export interface Ft42Status {
  reachable: boolean;
  responseTimeMs: number | null;
  authenticated: boolean;
  lastSuccessfulRequestAt: string | null;
  lastErrorSummary: string | null;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: {
    generatedAt: string;
    cached: boolean;
    staleData?: boolean;
    /** True while the backend is still completing its first-ever cache load (cold start) -
     * `data` is a structurally valid but empty placeholder, not a real "0" result. */
    warming?: boolean;
  };
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}

export type SortField = 'level' | 'login' | 'completedProjects' | 'lastCompletion';
export type SortDirection = 'asc' | 'desc';
export type TopStudentMetric = 'level' | 'completedProjects' | 'recentCompletions';
