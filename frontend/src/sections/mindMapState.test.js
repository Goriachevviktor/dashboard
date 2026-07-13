import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeMindMaps } from './mindMapState.js';

test('keeps an empty server list empty', () => {
  assert.deepEqual(normalizeMindMaps([]), []);
});

test('derives catalog metrics from a server map', () => {
  const [map] = normalizeMindMaps([
    {
      id: '7',
      root: {
        id: 'root',
        label: 'Старт',
        children: [{ id: 'child', label: 'Ветка', progress: 50, children: [] }],
      },
    },
  ]);

  assert.equal(map.id, '7');
  assert.equal(map.nodeCount, 1);
  assert.equal(map.progress, 50);
});
