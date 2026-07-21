import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { buildRoadmapWorkbookXlsxBuffer } from './roadmapWorkbook.js';

function roadmapWithBars(bars) {
  return {
    id: 'planning-roadmap',
    title: 'Planning order',
    desc: '',
    status: 'active',
    lanes: [{ id: 'lane-a', name: 'Lane A', color: '#007aff' }],
    bars: bars.map((bar, index) => ({
      id: bar.id || `bar-${index}`,
      lane: 'lane-a',
      status: 'planned',
      progress: 0,
      owner: '',
      memberIds: [],
      ...bar,
    })),
    milestones: [],
    timeline: {
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      months: [{ key: '2026-0', year: 2026, month: 0, label: 'Янв' }],
      quarters: [{ key: '2026-q0', label: 'Q1 2026', widthPct: 100, months: [{ key: '2026-0', label: 'Янв' }] }],
    },
  };
}

async function planningSheetFor(bars, today = new Date(2026, 0, 15)) {
  const buffer = await buildRoadmapWorkbookXlsxBuffer(roadmapWithBars(bars), [], { today });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.getWorksheet('Now-Next-Later');
}

function titlesInColumn(sheet, column, titles) {
  return sheet.getColumn(column).values.filter(value => titles.includes(value));
}

test('workbook honors explicit NNL buckets and ranks instead of date-derived groups', async () => {
  const bars = [
    { id: 'now-1', title: 'Manual now second', startDate: '2026-08-01', endDate: '2026-08-15', planningBucket: 'now', planningRank: 1 },
    { id: 'later-0', title: 'Manual later', startDate: '2026-07-01', endDate: '2026-07-15', planningBucket: 'later', planningRank: 0 },
    { id: 'now-0', title: 'Manual now first', startDate: '2026-09-01', endDate: '2026-09-15', planningBucket: 'now', planningRank: 0 },
  ];
  const titles = bars.map(bar => bar.title);
  const sheet = await planningSheetFor(bars);

  assert.deepEqual(titlesInColumn(sheet, 1, titles), ['Manual now first', 'Manual now second']);
  assert.deepEqual(titlesInColumn(sheet, 5, titles), []);
  assert.deepEqual(titlesInColumn(sheet, 9, titles), ['Manual later']);
});

test('workbook keeps legacy date and status grouping when planning fields are absent', async () => {
  const bars = [
    { id: 'active-range', title: 'Active range', startDate: '2026-01-01', endDate: '2026-01-31' },
    { id: 'progress', title: 'Progress override', status: 'progress', startDate: '2026-08-01', endDate: '2026-08-31' },
    { id: 'future-2', title: 'Future second', startDate: '2026-03-01', endDate: '2026-03-31' },
    { id: 'future-1', title: 'Future first', startDate: '2026-02-01', endDate: '2026-02-28' },
    { id: 'future-4', title: 'Future fourth', startDate: '2026-05-01', endDate: '2026-05-31' },
    { id: 'future-3', title: 'Future third', startDate: '2026-04-01', endDate: '2026-04-30' },
    { id: 'future-5', title: 'Future fifth', startDate: '2026-06-01', endDate: '2026-06-30' },
  ];
  const titles = bars.map(bar => bar.title);
  const sheet = await planningSheetFor(bars);

  assert.deepEqual(titlesInColumn(sheet, 1, titles), ['Active range', 'Progress override']);
  assert.deepEqual(titlesInColumn(sheet, 5, titles), ['Future first', 'Future second', 'Future third', 'Future fourth']);
  assert.deepEqual(titlesInColumn(sheet, 9, titles), ['Future fifth']);
});
