import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const caddyfile = readFileSync(new URL('../Caddyfile', import.meta.url), 'utf8');

test('app-shell cache policy covers all navigation entrypoints', () => {
  assert.match(caddyfile, /@app_shell\s+path\s+\/\s+\/index\.html\s+\/dashboard\.html/);
  assert.match(caddyfile, /header\s+@app_shell\s+Cache-Control\s+"no-store, no-cache, must-revalidate, max-age=0"/);
});

test('PWA assets are served explicitly', () => {
  assert.match(caddyfile, /@pwa_assets\s+path\s+\/service-worker\.js\s+\/manifest\.webmanifest/);
});
