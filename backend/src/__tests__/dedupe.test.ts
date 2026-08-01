import { describe, expect, it } from 'vitest';
import { dedupeById } from '../utils/dedupe.js';

describe('dedupeById', () => {
  it('removes duplicate IDs, keeping one record per ID', () => {
    const items = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 1, v: 'c' }];
    const result = dedupeById(items);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id).sort()).toEqual([1, 2]);
  });

  it('returns an empty array for empty input', () => {
    expect(dedupeById([])).toEqual([]);
  });

  it('skips items with a non-numeric id instead of throwing', () => {
    const items = [{ id: 1, v: 'a' }, { id: undefined as unknown as number, v: 'b' }];
    expect(dedupeById(items)).toEqual([{ id: 1, v: 'a' }]);
  });
});
