import assert from 'node:assert/strict';
import test from 'node:test';

import { legacyUserRoadmaps } from './roadmapState.js';

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
