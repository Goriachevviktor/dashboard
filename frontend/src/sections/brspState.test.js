import assert from 'node:assert/strict';
import test from 'node:test';
import { activeMeetingTopics, canDownloadDraft, completedTopics, topicIds, topicReports } from './brspState.js';

const catalog = [
  { id: 'a', name: 'ОЕМ', status: 'active' },
  { id: 'b', name: 'Терминалы', status: 'completed' },
];
const meetings = [
  { date: '2026-11-25', topics: [{ id: 'a', name: 'ОЕМ', text: '' }] },
  { date: '2026-11-18', topics: [{ id: 'a', name: 'ОЕМ', text: 'Новый' }, { id: 'b', name: 'Терминалы', text: 'Закрыто' }] },
  { date: '2026-11-11', topics: [{ id: 'a', name: 'ОЕМ', text: 'Старый' }] },
];

test('completed topics are global, even when absent from selected meeting', () => {
  assert.deepEqual(activeMeetingTopics(meetings[1], catalog).map(topic => topic.id), ['a']);
  assert.deepEqual(completedTopics(catalog).map(topic => topic.id), ['b']);
  assert.equal(meetings[0].topics.some(topic => topic.id === 'b'), false);
});

test('reports are newest first and current meeting is not duplicated', () => {
  assert.deepEqual(topicReports(meetings, 'a', '2026-11-25'), [
    { date: '2026-11-18', text: 'Новый' },
    { date: '2026-11-11', text: 'Старый' },
  ]);
  assert.deepEqual(topicReports(meetings, 'b'), [{ date: '2026-11-18', text: 'Закрыто' }]);
});

test('historical aliases share status and report history', () => {
  const withAlias = [{ id: 'a', aliases: ['old-a'], name: 'ОЕМ', status: 'completed' }];
  const history = [
    { date: '2026-11-18', topics: [{ id: 'a', name: 'ОЕМ', text: 'Новый' }] },
    { date: '2026-09-16', topics: [{ id: 'old-a', name: 'ОЕМ', text: 'Старый' }] },
  ];
  assert.deepEqual(activeMeetingTopics(history[1], withAlias), []);
  assert.deepEqual(topicReports(history, topicIds(withAlias, 'a')), [
    { date: '2026-11-18', text: 'Новый' },
    { date: '2026-09-16', text: 'Старый' },
  ]);
});

test('PDF download requires a draft with a nonempty current report', () => {
  assert.equal(canDownloadDraft(null), false);
  assert.equal(canDownloadDraft({ status: 'done', topics: [{ text: 'Доклад' }] }), false);
  assert.equal(canDownloadDraft({ status: 'draft', topics: [{ text: ' \n ' }] }), false);
  assert.equal(canDownloadDraft({ status: 'draft', topics: [{ text: '--------' }] }), false);
  assert.equal(canDownloadDraft({ status: 'draft', topics: [{ text: '' }, { text: 'Доклад' }] }), true);
});
