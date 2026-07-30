import type { ProjectCompletion, StudentSummary } from '../models/types.js';

const COMMON_CORE_PROJECTS = [
  'Libft',
  'get_next_line',
  'ft_printf',
  'born2beroot',
  'minitalk',
  'pipex',
  'philosophers',
  'minishell',
  'NetPractice',
  'cub3D',
  'push_swap',
  'so_long',
  'CPP Module 00',
  'CPP Module 01',
  'CPP Module 02',
  'inception',
  'webserv',
  'ft_transcendence',
];

const FIRST_NAMES = [
  'Anna', 'Piotr', 'Kasia', 'Marek', 'Ola', 'Tomasz', 'Zofia', 'Jakub', 'Magda', 'Igor',
  'Ewa', 'Adam', 'Natalia', 'Bartek', 'Julia', 'Michal', 'Agata', 'Kamil', 'Wiktoria', 'Filip',
];
const LAST_NAMES = [
  'Kowalski', 'Nowak', 'Wisniewski', 'Wojcik', 'Kaminski', 'Lewandowski', 'Zielinski', 'Szymanski',
  'Wozniak', 'Kozlowski', 'Jankowski', 'Mazur', 'Krawczyk', 'Piotrowski', 'Grabowski', 'Nowakowski',
  'Pawlowski', 'Michalski', 'Nowicki', 'Adamczyk',
];

/** Deterministic PRNG so mock data stays stable across requests within a process. */
function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;

export interface MockCurrentProject {
  projectId: number;
  projectName: string;
  status: string;
}

function buildMockStudent(
  id: number,
  login: string,
  displayName: string,
  seedOffset: number,
  forceOnline: boolean,
  boostAchievement: boolean,
): {
  student: Omit<
    StudentSummary,
    'completedProjectCount' | 'currentProjectCount' | 'lastCompletionDate' | 'lastCompletedProject'
  >;
  completions: ProjectCompletion[];
  currentProjectCount: number;
  currentProjects: MockCurrentProject[];
} {
  const level = Math.round((rng() * 12 + seedOffset % 3) * 100) / 100;
  const completedCount = Math.floor(rng() * 10) + 1;
  const shuffled = [...COMMON_CORE_PROJECTS].sort(() => rng() - 0.5);
  const shuffledProjects = shuffled.slice(0, completedCount);
  const currentProjectNames = shuffled.slice(completedCount, completedCount + (Math.floor(rng() * 3)));

  const completions: ProjectCompletion[] = shuffledProjects.map((projectName, idx) => {
    const isBoosted = boostAchievement && idx === 0;
    const daysAgoValue = isBoosted ? 0 : Math.floor(rng() * 60);
    const completedAt = isBoosted
      ? new Date(Date.now() - Math.floor(rng() * 45) * 60 * 1000).toISOString()
      : new Date(Date.now() - daysAgoValue * 24 * 60 * 60 * 1000).toISOString();
    const validated = isBoosted || rng() > 0.15;
    return {
      projectUserId: id * 1000 + idx,
      studentId: id,
      login,
      displayName,
      imageUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${login}`,
      projectId: COMMON_CORE_PROJECTS.indexOf(projectName) + 1,
      projectName,
      finalMark: isBoosted ? Math.floor(rng() * 21) + 100 : validated ? Math.floor(rng() * 41) + 60 : Math.floor(rng() * 50),
      validated,
      status: 'finished',
      completedAt,
    };
  });

  const currentProjects: MockCurrentProject[] = currentProjectNames.map((projectName) => ({
    projectId: COMMON_CORE_PROJECTS.indexOf(projectName) + 1,
    projectName,
    status: 'in_progress',
  }));

  const isOnlineNow = forceOnline || rng() > 0.55;
  const sessionMinutesAgo = Math.floor(rng() * 6 * 60);
  const activeSince = isOnlineNow ? new Date(Date.now() - sessionMinutesAgo * 60 * 1000).toISOString() : null;

  const isDangerZone = seedOffset % 9 === 0;
  const isBlackholed = isDangerZone || rng() > 0.7;
  const blackholeDaysOut = isDangerZone ? Math.floor(rng() * 3) + 1 : Math.floor(rng() * 40) + 5;
  const blackholedAt = isBlackholed ? new Date(Date.now() + blackholeDaysOut * 24 * 60 * 60 * 1000).toISOString() : null;

  return {
    student: {
      id,
      login,
      displayName,
      imageUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${login}`,
      level,
      correctionPoints: Math.floor(rng() * 8),
      wallet: Math.floor(rng() * 500),
      active: rng() > 0.1,
      campusName: 'Warsaw',
      cursusName: '42cursus',
      activeSince,
      blackholedAt,
    },
    completions,
    currentProjectCount: currentProjects.length,
    currentProjects,
  };
}

export interface MockDataset {
  students: StudentSummary[];
  completions: ProjectCompletion[];
  projectNames: string[];
  currentProjectsByStudent: Map<number, MockCurrentProject[]>;
}

export function generateMockDataset(featuredLogin: string): MockDataset {
  const students: StudentSummary[] = [];
  const allCompletions: ProjectCompletion[] = [];
  const currentProjectsByStudent = new Map<number, MockCurrentProject[]>();

  const logins: Array<{ login: string; displayName: string }> = [
    { login: featuredLogin, displayName: 'Muhammad Afzal' },
  ];

  for (let i = 0; i < 24; i += 1) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const login = `${first.slice(0, 1).toLowerCase()}${last.toLowerCase()}${i}`;
    logins.push({ login, displayName: `${first} ${last}` });
  }

  logins.forEach((entry, index) => {
    const { student, completions, currentProjectCount, currentProjects } = buildMockStudent(
      index + 1,
      entry.login,
      entry.displayName,
      index,
      index < 4, // guarantee the featured student + a few others are always online for the Hive
      index === 0 || index === 3, // guarantee at least one achievement takeover fires during a demo
    );
    const validatedSorted = [...completions].filter((c) => c.validated).sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
    );
    const last = validatedSorted[0];

    students.push({
      ...student,
      completedProjectCount: completions.filter((c) => c.validated).length,
      currentProjectCount,
      lastCompletionDate: last?.completedAt ?? null,
      lastCompletedProject: last?.projectName ?? null,
    });
    allCompletions.push(...completions);
    currentProjectsByStudent.set(student.id, currentProjects);
  });

  return { students, completions: allCompletions, projectNames: COMMON_CORE_PROJECTS, currentProjectsByStudent };
}
