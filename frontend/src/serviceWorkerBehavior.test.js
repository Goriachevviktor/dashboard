import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('malformed notification URL falls back to the dashboard', async () => {
  const listeners = new Map();
  const opened = [];
  const self = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    clients: {
      matchAll: async () => [],
      openWindow: async url => { opened.push(url); },
      claim: async () => {},
    },
    location: { origin: 'https://dashboard.example' },
    registration: { showNotification: async () => {} },
    skipWaiting: () => {},
  };
  vm.runInNewContext(readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8'), { self, URL, Promise });

  let pending;
  listeners.get('notificationclick')({
    notification: { close() {}, data: { url: 'http://[' } },
    waitUntil: promise => { pending = promise; },
  });
  await pending;

  assert.deepEqual(opened, ['https://dashboard.example/dashboard.html']);
});
