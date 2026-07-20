import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatLocalDateInputValue,
  resolveRoadmapBarInitialDates,
} from './roadmapDateDefaults.js';

test('formats local calendar components with zero padding instead of UTC date', () => {
  const dateLike = {
    getFullYear: () => 2026,
    getMonth: () => 0,
    getDate: () => 2,
    toISOString: () => '2026-01-01T21:00:00.000Z',
  };

  assert.equal(formatLocalDateInputValue(dateLike), '2026-01-02');
});

test('new roadmap bar starts and ends on its local creation date', () => {
  const now = new Date(2026, 6, 20, 23, 55);
  assert.deepEqual(resolveRoadmapBarInitialDates({
    bar: null,
    legacyStartDate: '2026-01-01',
    legacyEndDate: '2026-03-31',
    now,
  }), {
    startDate: '2026-07-20',
    endDate: '2026-07-20',
  });
});

test('existing roadmap bar keeps saved dates', () => {
  assert.deepEqual(resolveRoadmapBarInitialDates({
    bar: { startDate: '2025-11-03', endDate: '2026-02-14' },
    legacyStartDate: '2026-01-01',
    legacyEndDate: '2026-03-31',
    now: new Date(2026, 6, 20),
  }), {
    startDate: '2025-11-03',
    endDate: '2026-02-14',
  });
});

test('existing legacy bar still uses supplied legacy fallbacks', () => {
  assert.deepEqual(resolveRoadmapBarInitialDates({
    bar: {},
    legacyStartDate: '2024-01-01',
    legacyEndDate: '2024-03-31',
    now: new Date(2026, 6, 20),
  }), {
    startDate: '2024-01-01',
    endDate: '2024-03-31',
  });
});
