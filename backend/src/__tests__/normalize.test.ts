import { describe, expect, it } from 'vitest';
import {
  isActiveCursusUser,
  isValidatedCompletion,
  normalizeProjectCompletion,
  pickDisplayName,
  pickImageUrl,
  resolveCompletionDate,
  selectCursusRecord,
} from '../services/normalize.js';
import type { RawCursusUser, RawProjectUser } from '../models/types.js';

describe('pickDisplayName', () => {
  it('prefers displayname, then usual_full_name, then login', () => {
    expect(pickDisplayName({ displayname: 'D', usual_full_name: 'F', login: 'l' })).toBe('D');
    expect(pickDisplayName({ usual_full_name: 'F', login: 'l' })).toBe('F');
    expect(pickDisplayName({ login: 'l' })).toBe('l');
  });
});

describe('pickImageUrl', () => {
  it('falls back through medium, small, then link', () => {
    expect(pickImageUrl({ image: { versions: { medium: 'm' } } })).toBe('m');
    expect(pickImageUrl({ image: { versions: { small: 's' } } })).toBe('s');
    expect(pickImageUrl({ image: { link: 'l' } })).toBe('l');
    expect(pickImageUrl({})).toBeNull();
  });
});

describe('isActiveCursusUser', () => {
  it('treats a null/undefined end_at as active', () => {
    expect(isActiveCursusUser({ end_at: null })).toBe(true);
    expect(isActiveCursusUser({ end_at: undefined })).toBe(true);
    expect(isActiveCursusUser({ end_at: '2020-01-01T00:00:00Z' })).toBe(false);
  });
});

describe('isValidatedCompletion', () => {
  it('requires status=finished AND validated?=true', () => {
    expect(isValidatedCompletion({ status: 'finished', 'validated?': true })).toBe(true);
    expect(isValidatedCompletion({ status: 'finished', 'validated?': false })).toBe(false);
    expect(isValidatedCompletion({ status: 'in_progress', 'validated?': true })).toBe(false);
    expect(isValidatedCompletion({ status: 'finished', 'validated?': null })).toBe(false);
  });
});

describe('resolveCompletionDate', () => {
  it('prioritizes marked_at, then updated_at, then created_at', () => {
    expect(resolveCompletionDate({ marked_at: 'm', updated_at: 'u', created_at: 'c' })).toBe('m');
    expect(resolveCompletionDate({ marked_at: null, updated_at: 'u', created_at: 'c' })).toBe('u');
    expect(resolveCompletionDate({ marked_at: null, updated_at: null, created_at: 'c' })).toBe('c');
    expect(resolveCompletionDate({ marked_at: null, updated_at: null, created_at: null })).toBeNull();
  });
});

describe('normalizeProjectCompletion', () => {
  const base: RawProjectUser = {
    id: 1,
    final_mark: 90,
    status: 'finished',
    'validated?': true,
    marked_at: '2026-01-01T00:00:00Z',
    updated_at: null,
    created_at: null,
    user: { id: 5, login: 'jdoe' },
    project: { id: 9, name: 'Libft' },
  };

  it('maps a valid raw record into a ProjectCompletion', () => {
    const result = normalizeProjectCompletion(base);
    expect(result).toMatchObject({
      studentId: 5,
      login: 'jdoe',
      projectId: 9,
      projectName: 'Libft',
      validated: true,
      completedAt: '2026-01-01T00:00:00Z',
    });
  });

  it('returns null when user or project is missing', () => {
    expect(normalizeProjectCompletion({ ...base, user: undefined })).toBeNull();
    expect(normalizeProjectCompletion({ ...base, project: undefined })).toBeNull();
  });

  it('returns null when there is no usable completion date', () => {
    expect(normalizeProjectCompletion({ ...base, marked_at: null, updated_at: null, created_at: null })).toBeNull();
  });
});

// ─── selectCursusRecord ───────────────────────────────────────────────────────

function makeCursusUser(overrides: Partial<RawCursusUser> = {}): RawCursusUser {
  return {
    id: 1,
    level: 5,
    end_at: null,
    blackholed_at: '2026-09-01T00:00:00Z',
    cursus_id: 21,
    updated_at: '2026-01-01T00:00:00Z',
    user: { id: 100, login: 'alice' },
    ...overrides,
  };
}

describe('selectCursusRecord', () => {
  it('returns null for empty input', () => {
    expect(selectCursusRecord([])).toBeNull();
  });

  it('returns the single record directly', () => {
    const rec = makeCursusUser();
    expect(selectCursusRecord([rec])).toBe(rec);
  });

  it('prefers an active record (end_at null) over an ended one', () => {
    const active = makeCursusUser({ id: 1, end_at: null, updated_at: '2025-01-01T00:00:00Z' });
    const ended  = makeCursusUser({ id: 2, end_at: '2024-06-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
    // ended has a more recent updated_at but active is still preferred
    expect(selectCursusRecord([ended, active])).toBe(active);
  });

  it('among active records, picks the most recently updated', () => {
    const older = makeCursusUser({ id: 1, end_at: null, updated_at: '2025-01-01T00:00:00Z' });
    const newer = makeCursusUser({ id: 2, end_at: null, updated_at: '2026-06-01T00:00:00Z' });
    expect(selectCursusRecord([older, newer])).toBe(newer);
  });

  it('among active records with identical updated_at, picks the higher id', () => {
    const lo = makeCursusUser({ id: 10, end_at: null, updated_at: '2026-01-01T00:00:00Z' });
    const hi = makeCursusUser({ id: 99, end_at: null, updated_at: '2026-01-01T00:00:00Z' });
    expect(selectCursusRecord([lo, hi])).toBe(hi);
  });

  it('when no active record exists, falls back to the most recently updated ended record', () => {
    const old = makeCursusUser({ id: 1, end_at: '2023-01-01T00:00:00Z', updated_at: '2023-01-01T00:00:00Z' });
    const recent = makeCursusUser({ id: 2, end_at: '2024-06-01T00:00:00Z', updated_at: '2024-06-01T00:00:00Z' });
    expect(selectCursusRecord([old, recent])).toBe(recent);
  });

  it('uses id as a deterministic tie-breaker among ended records with same updated_at', () => {
    const lo = makeCursusUser({ id: 5,  end_at: '2024-01-01T00:00:00Z', updated_at: '2024-06-01T00:00:00Z' });
    const hi = makeCursusUser({ id: 20, end_at: '2024-01-01T00:00:00Z', updated_at: '2024-06-01T00:00:00Z' });
    expect(selectCursusRecord([lo, hi])).toBe(hi);
  });
});
