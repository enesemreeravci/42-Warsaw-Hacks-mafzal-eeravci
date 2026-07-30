import { describe, expect, it } from 'vitest';
import {
  isActiveCursusUser,
  isValidatedCompletion,
  normalizeProjectCompletion,
  pickDisplayName,
  pickImageUrl,
  resolveCompletionDate,
} from '../services/normalize.js';
import type { RawProjectUser } from '../models/types.js';

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
