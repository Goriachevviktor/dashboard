import assert from 'node:assert/strict';
import test from 'node:test';

import { legacyRoadmapRaw, legacyUserRoadmaps, normalizeRoadmaps } from './roadmapState.js';

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
