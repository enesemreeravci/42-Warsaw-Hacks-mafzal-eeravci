import type { ProjectCompletion, RawCursusUser, RawProjectUser, RawUser, StudentSummary } from '../models/types.js';

export function pickImageUrl(user: Pick<RawUser, 'image'>): string | null {
  return user.image?.versions?.medium ?? user.image?.versions?.small ?? user.image?.link ?? null;
}

export function pickDisplayName(user: Pick<RawUser, 'displayname' | 'usual_full_name' | 'login'>): string {
  return user.displayname ?? user.usual_full_name ?? user.login;
}

/** A cursus_users record represents an active enrollment when it has no end date. */
export function isActiveCursusUser(cursusUser: Pick<RawCursusUser, 'end_at'>): boolean {
  return cursusUser.end_at === null || cursusUser.end_at === undefined;
}

/**
 * Selects the best cursus_user record when a student has multiple records for the same cursus.
 * Priority:
 *   1. Active records (end_at null/undefined) are preferred over ended records.
 *   2. Among records of equal activity status, the most recently updated takes precedence.
 *   3. Highest id is the deterministic tie-breaker.
 *
 * Per TASK.md §6.2: never use `user.cursus_users[0]` — always apply this deterministic rule.
 */
export function selectCursusRecord(records: RawCursusUser[]): RawCursusUser | null {
  if (records.length === 0) return null;
  if (records.length === 1) return records[0]!;

  return [...records].sort((a, b) => {
    const aActive = isActiveCursusUser(a) ? 0 : 1;
    const bActive = isActiveCursusUser(b) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;

    const aUpd = a.updated_at ?? '';
    const bUpd = b.updated_at ?? '';
    if (aUpd !== bUpd) return bUpd.localeCompare(aUpd);

    return b.id - a.id;
  })[0]!;
}

/**
 * `validated?` is not a legal TS identifier, so raw records are normalized
 * into a plain `validated` boolean the moment they cross the API boundary.
 */
export function isValidatedCompletion(projectUser: Pick<RawProjectUser, 'status' | 'validated?'>): boolean {
  return projectUser.status === 'finished' && projectUser['validated?'] === true;
}

export function isCurrentProject(projectUser: Pick<RawProjectUser, 'status'>): boolean {
  return projectUser.status === 'in_progress' || projectUser.status === 'searching_a_group' || projectUser.status === 'creating_group';
}

/** marked_at > updated_at > created_at, per the documented completion-date priority. */
export function resolveCompletionDate(
  projectUser: Pick<RawProjectUser, 'marked_at' | 'updated_at' | 'created_at'>,
): string | null {
  return projectUser.marked_at ?? projectUser.updated_at ?? projectUser.created_at ?? null;
}

export function normalizeProjectCompletion(raw: RawProjectUser): ProjectCompletion | null {
  const user = raw.user;
  const project = raw.project;
  if (!user || !project) return null;

  const completedAt = resolveCompletionDate(raw);
  if (!completedAt) return null;

  return {
    projectUserId: raw.id,
    studentId: user.id,
    login: user.login,
    displayName: pickDisplayName(user),
    imageUrl: pickImageUrl(user),
    projectId: project.id,
    projectName: project.name,
    finalMark: raw.final_mark ?? null,
    validated: isValidatedCompletion(raw),
    status: raw.status ?? 'unknown',
    completedAt,
  };
}

export interface StudentNormalizationInput {
  user: RawUser;
  cursusUser: RawCursusUser | undefined;
  campusName: string;
  cursusName: string;
  completedProjects: ProjectCompletion[];
  currentProjectCount: number;
  /** Resolved from a best-effort `/v2/campus/:id/locations` lookup; null if not currently active or unavailable. */
  activeSince?: string | null;
}

export function normalizeStudentSummary(input: StudentNormalizationInput): StudentSummary {
  const { user, cursusUser, campusName, cursusName, completedProjects, currentProjectCount, activeSince } = input;

  const sortedCompletions = [...completedProjects].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );
  const last = sortedCompletions[0];

  return {
    id: user.id,
    login: user.login,
    displayName: pickDisplayName(user),
    imageUrl: pickImageUrl(user),
    level: cursusUser?.level ?? 0,
    correctionPoints: user.correction_point ?? 0,
    wallet: user.wallet ?? 0,
    active: cursusUser ? isActiveCursusUser(cursusUser) : false,
    campusName,
    cursusName,
    completedProjectCount: completedProjects.filter((p) => p.validated).length,
    currentProjectCount,
    lastCompletionDate: last?.completedAt ?? null,
    lastCompletedProject: last?.projectName ?? null,
    activeSince: activeSince ?? null,
    blackholedAt: cursusUser?.blackholed_at ?? null,
  };
}
