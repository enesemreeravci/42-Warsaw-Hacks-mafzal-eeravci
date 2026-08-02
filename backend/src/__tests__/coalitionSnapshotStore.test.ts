import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CoalitionSnapshotStore } from '../services/coalitionSnapshotStore.js';

const NOW = new Date('2026-07-31T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const silentLogger = { warn: () => undefined } as unknown as import('../config/logger.js').Logger;

describe('CoalitionSnapshotStore', () => {
  let dir: string;
  let filePath: string;
  let store: CoalitionSnapshotStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'coalition-snapshot-test-'));
    filePath = path.join(dir, 'snapshots.json');
    store = new CoalitionSnapshotStore(filePath, silentLogger);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns an empty array when the file has never been written', async () => {
    expect(await store.read()).toEqual([]);
  });

  it('round-trips a snapshot through append() and read()', async () => {
    await store.append(new Map([[1, 100], [2, 250]]), NOW);
    const snapshots = await store.read();
    expect(snapshots).toEqual([{ takenAt: NOW.toISOString(), scores: { '1': 100, '2': 250 } }]);
  });

  it('accumulates multiple snapshots in append order', async () => {
    await store.append(new Map([[1, 100]]), new Date(NOW.getTime() - DAY_MS));
    await store.append(new Map([[1, 150]]), NOW);
    const snapshots = await store.read();
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]!.scores['1']).toBe(100);
    expect(snapshots[1]!.scores['1']).toBe(150);
  });

  it('prunes snapshots older than the retention window on append', async () => {
    const veryOld = new Date(NOW.getTime() - 200 * DAY_MS);
    await store.append(new Map([[1, 50]]), veryOld);
    await store.append(new Map([[1, 100]]), NOW);

    const snapshots = await store.read();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.takenAt).toBe(NOW.toISOString());
  });

  it('treats a corrupt file as empty history instead of throwing', async () => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, 'not valid json{{{', 'utf-8');
    expect(await store.read()).toEqual([]);
  });

  it('creates the parent directory automatically if it does not exist yet', async () => {
    const nestedPath = path.join(dir, 'nested', 'subdir', 'snapshots.json');
    const nestedStore = new CoalitionSnapshotStore(nestedPath, silentLogger);
    await nestedStore.append(new Map([[1, 10]]), NOW);
    expect(await nestedStore.read()).toHaveLength(1);
  });
});
