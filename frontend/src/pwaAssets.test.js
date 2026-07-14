import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(frontendRoot, 'public');

test('PWA assets and same-origin service worker lifecycle stay complete', () => {
  const manifestPath = resolve(publicRoot, 'manifest.webmanifest');
  const serviceWorkerPath = resolve(publicRoot, 'service-worker.js');

  assert.ok(existsSync(manifestPath), 'manifest.webmanifest must exist');
  assert.ok(existsSync(serviceWorkerPath), 'service-worker.js must exist');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest must declare icons');

  for (const url of [manifest.start_url, manifest.scope]) {
    assert.match(url, /^\/(?!\/)/, `manifest URL must be same-origin: ${url}`);
  }

  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\/(?!\/)/, `icon URL must be same-origin: ${icon.src}`);
    assert.ok(existsSync(resolve(publicRoot, icon.src.slice(1))), `declared icon must exist: ${icon.src}`);
  }

  const mainSource = readFileSync(resolve(frontendRoot, 'src/main.jsx'), 'utf8');
  assert.match(mainSource, /navigator\.serviceWorker\.getRegistrations\(\)/, 'main.jsx must include the service worker registration lifecycle hook');

  const htmlSource = readFileSync(resolve(frontendRoot, 'index.html'), 'utf8');
  assert.match(htmlSource, /<link\s+rel=["']manifest["']\s+href=["']\/(?!\/)[^"']+["']\s*\/>/, 'index.html must reference a same-origin manifest');
});
