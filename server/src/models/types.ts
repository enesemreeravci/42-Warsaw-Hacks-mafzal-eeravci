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
  /** ISO timestamp of the start of the student's current on-campus session, or null if not currently logged in. */
  activeSince: string | null;
  /** ISO timestamp of the student's black hole date, or null if not blackholed/not applicable. */
  blackholedAt: string | null;
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
  latestCompletionAt: string | null;
  generatedAt: string;
  cacheStatus: CacheStatus;
}

export interface CompletionTrendPoint {
  date: string;
  count: number;
}

export interface ProjectRanking {
  projectId: number;
  projectName: string;
  completionCount: number;
  averageFinalMark: number;
}

export interface StudentRanking {
  id: number;
  login: string;
  displayName: string;
  imageUrl: string | null;
  value: number;
  metric: 'level' | 'completedProjects' | 'recentCompletions';
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface StudentDetail extends StudentSummary {
  currentProjects: Array<{ projectId: number; projectName: string; status: string }>;
  completedProjects: ProjectCompletion[];
  recentCompletions: ProjectCompletion[];
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

export interface LivePulse {
  activeNow: ActiveSessionEntry[];
  xpLeaderboard: XpLeaderboardEntry[];
  blackHoleWatch: BlackHoleWatchEntry[];
  achievements: AchievementEntry[];
}

/** Minimal raw 42 API shapes we rely on (subset only, fields vary in completeness). */
export interface RawCampus {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface RawCursus {
  id: number;
  name: string;
  slug?: string;
  [key: string]: unknown;
}

export interface RawUser {
  id: number;
  login: string;
  displayname?: string;
  usual_full_name?: string;
  image?: { link?: string; versions?: { medium?: string; small?: string } };
  correction_point?: number;
  wallet?: number;
  [key: string]: unknown;
}

export interface RawCursusUser {
  id: number;
  level?: number;
  begin_at?: string | null;
  end_at?: string | null;
  blackholed_at?: string | null;
  cursus_id?: number;
  user?: RawUser;
  cursus?: RawCursus;
  [key: string]: unknown;
}

/** A `/v2/campus/:id/locations` record; `end_at: null` means the session is still active. */
export interface RawLocation {
  id: number;
  begin_at: string;
  end_at: string | null;
  user?: RawUser;
  [key: string]: unknown;
}

export interface RawProject {
  id: number;
  name: string;
  slug?: string;
  [key: string]: unknown;
}

export interface RawProjectUser {
  id: number;
  final_mark: number | null;
  status?: string;
  'validated?'?: boolean | null;
  marked_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  occurrence?: number;
  user?: RawUser;
  project?: RawProject;
  cursus_ids?: number[];
  [key: string]: unknown;
}
