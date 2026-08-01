import { describe, expect, it } from 'vitest';
import { buildRecentEvaluations, normalizeEvaluation } from '../services/evaluations.js';
import type { RawScaleTeam, StudentSummary } from '../models/types.js';

function makeStudent(overrides: Partial<StudentSummary> = {}): StudentSummary {
  return {
    id: 1,
    login: 'jdoe',
    displayName: 'J Doe',
    imageUrl: 'https://img/jdoe.png',
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

function makeScaleTeam(overrides: Partial<RawScaleTeam> = {}): RawScaleTeam {
  return {
    id: 1,
    final_mark: 90,
    filled_at: new Date().toISOString(),
    flag: { id: 1, name: 'Ok', positive: true },
    corrector: { id: 2, login: 'corrector' },
    correcteds: [{ id: 1, login: 'jdoe' }],
    team: { name: 'Libft' },
    ...overrides,
  };
}

describe('normalizeEvaluation', () => {
  it('maps only the safe fields, resolving corrected student from the roster', () => {
    const studentsByLogin = new Map([['jdoe', makeStudent()]]);
    const result = normalizeEvaluation(makeScaleTeam(), studentsByLogin);

    expect(result).toMatchObject({
      correctedLogin: 'jdoe',
      correctedDisplayName: 'J Doe',
      correctedImageUrl: 'https://img/jdoe.png',
      projectName: 'Libft',
      finalMark: 90,
      flagName: 'Ok',
      flagPositive: true,
    });
  });

  it('never surfaces comment or feedback even if present on the raw record', () => {
    const raw = { ...makeScaleTeam(), comment: 'this student was rude', feedback: 'harsh peer commentary' } as RawScaleTeam;
    const result = normalizeEvaluation(raw, new Map());

    expect(result).not.toBeNull();
    expect(Object.keys(result!)).not.toContain('comment');
    expect(Object.keys(result!)).not.toContain('feedback');
    expect(JSON.stringify(result)).not.toMatch(/rude|harsh peer commentary/);
  });

  it('falls back to the raw login/null avatar when the corrected student is not in the roster', () => {
    const result = normalizeEvaluation(makeScaleTeam(), new Map());
    expect(result).toMatchObject({ correctedLogin: 'jdoe', correctedDisplayName: 'jdoe', correctedImageUrl: null });
  });

  it('returns null when there is no corrected student or the evaluation was never filled', () => {
    expect(normalizeEvaluation(makeScaleTeam({ correcteds: [] }), new Map())).toBeNull();
    expect(normalizeEvaluation(makeScaleTeam({ filled_at: null }), new Map())).toBeNull();
  });
});

describe('buildRecentEvaluations', () => {
  it('skips unfilled evaluations and sorts newest first', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    const older = new Date(now.getTime() - 60_000).toISOString();
    const raw: RawScaleTeam[] = [
      makeScaleTeam({ id: 1, filled_at: older }),
      makeScaleTeam({ id: 2, filled_at: now.toISOString() }),
      makeScaleTeam({ id: 3, filled_at: null }),
    ];

    const result = buildRecentEvaluations(raw, new Map(), 10);

    expect(result.map((e) => e.id)).toEqual([2, 1]);
  });

  it('respects the limit', () => {
    const raw = [1, 2, 3].map((id) => makeScaleTeam({ id }));
    expect(buildRecentEvaluations(raw, new Map(), 2)).toHaveLength(2);
  });
});
