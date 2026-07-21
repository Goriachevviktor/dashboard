import test from 'node:test';
import assert from 'node:assert/strict';
import { persistRoadmapReorder } from './roadmapReorderPersistence.js';

test('installs optimistic order and replaces it with the normalized server response', async () => {
  const installed = [];
  const previousRoadmap = { id: 'r1', lanes: [{ id: 'a' }, { id: 'b' }] };
  const nextRoadmap = { ...previousRoadmap, lanes: [{ id: 'b' }, { id: 'a' }] };
  const saved = { ...nextRoadmap, period: 'normalized' };
  let patchCalls = 0;
  let normalizeCalls = 0;

  const result = await persistRoadmapReorder({
    previousRoadmap,
    nextRoadmap,
    patchRoadmap: async (id, roadmap) => {
      patchCalls += 1;
      assert.equal(id, 'r1');
      assert.equal(roadmap, nextRoadmap);
      return saved;
    },
    replaceRoadmap: roadmap => installed.push(roadmap),
    normalizeRoadmap: roadmap => {
      normalizeCalls += 1;
      return roadmap;
    },
  });

  assert.deepEqual(installed, [nextRoadmap, saved]);
  assert.equal(result, saved);
  assert.equal(patchCalls, 1);
  assert.equal(normalizeCalls, 1);
});

test('restores the exact previous roadmap and reports once after PATCH failure', async () => {
  const installed = [];
  const previousRoadmap = { id: 'r1', lanes: [{ id: 'a' }, { id: 'b' }] };
  const nextRoadmap = { ...previousRoadmap, lanes: [{ id: 'b' }, { id: 'a' }] };
  const error = new Error('offline');
  let patchCalls = 0;
  let errorCalls = 0;

  const result = await persistRoadmapReorder({
    previousRoadmap,
    nextRoadmap,
    patchRoadmap: async () => {
      patchCalls += 1;
      throw error;
    },
    replaceRoadmap: roadmap => installed.push(roadmap),
    normalizeRoadmap: roadmap => roadmap,
    onError: received => {
      errorCalls += 1;
      assert.equal(received, error);
    },
  });

  assert.deepEqual(installed, [nextRoadmap, previousRoadmap]);
  assert.equal(installed[1], previousRoadmap);
  assert.equal(result, null);
  assert.equal(patchCalls, 1);
  assert.equal(errorCalls, 1);
});
