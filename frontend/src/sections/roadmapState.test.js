import assert from 'node:assert/strict';
import test from 'node:test';

import * as roadmapState from './roadmapState.js';

const { legacyRoadmapRaw, legacyUserRoadmaps, normalizeRoadmaps } = roadmapState;

test('legacy migration excludes known sample ids', () => {
  const maps = legacyUserRoadmaps(JSON.stringify([
    { id: 'rm-ai-initiatives-2026', title: 'Sample', lanes: [], bars: [], milestones: [] },
    { id: 'rm-personal', title: 'Personal', lanes: [], bars: [], milestones: [] },
  ]), new Set(['rm-ai-initiatives-2026']), value => value);

  assert.deepEqual(maps.map(map => map.id), ['rm-personal']);
});

test('legacy migration ignores invalid browser data', () => {
  assert.deepEqual(legacyUserRoadmaps('{', new Set(), value => value), []);
});

test('legacy storage access failure does not block API loading', () => {
  assert.equal(legacyRoadmapRaw(() => { throw new Error('storage blocked'); }), '');
});

test('normalizes API roadmaps without browser sample fallback', () => {
  const maps = normalizeRoadmaps([
    { id: 'rm-server', title: 'Server map', lanes: [], bars: [], milestones: [] },
  ], value => ({ ...value, normalized: true }));

  assert.deepEqual(maps, [{ id: 'rm-server', title: 'Server map', lanes: [], bars: [], milestones: [], normalized: true }]);
});

test('successful legacy migration is cleared and cannot resurrect after delete and reload', async () => {
  assert.equal(typeof roadmapState.migrateLegacyRoadmaps, 'function');
  let stored = JSON.stringify([{ id: 'rm-legacy', title: 'Legacy' }]);
  let server = [];
  let importCalls = 0;
  const dependencies = {
    readLegacy: () => stored,
    parseLegacy: raw => JSON.parse(raw || '[]'),
    importRoadmaps: async maps => { importCalls += 1; server = [...server, ...maps]; },
    listRoadmaps: async () => server,
    clearLegacy: () => { stored = ''; },
  };

  assert.deepEqual(await roadmapState.migrateLegacyRoadmaps(dependencies), [{ id: 'rm-legacy', title: 'Legacy' }]);
  server = [];
  assert.deepEqual(await roadmapState.migrateLegacyRoadmaps(dependencies), []);
  assert.equal(importCalls, 1);
});

test('failed legacy migration preserves browser data for retry', async () => {
  assert.equal(typeof roadmapState.migrateLegacyRoadmaps, 'function');
  let stored = JSON.stringify([{ id: 'rm-retry', title: 'Retry' }]);
  let attempts = 0;
  const dependencies = {
    readLegacy: () => stored,
    parseLegacy: raw => JSON.parse(raw || '[]'),
    importRoadmaps: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary failure');
    },
    listRoadmaps: async () => [{ id: 'rm-retry', title: 'Retry' }],
    clearLegacy: () => { stored = ''; },
  };

  await assert.rejects(roadmapState.migrateLegacyRoadmaps(dependencies), /temporary failure/);
  assert.notEqual(stored, '');
  assert.deepEqual(await roadmapState.migrateLegacyRoadmaps(dependencies), [{ id: 'rm-retry', title: 'Retry' }]);
  assert.equal(stored, '');
  assert.equal(attempts, 2);
});
