import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardRequest } from './api.js';

test('dashboardRequest returns a PDF response as a blob', async () => {
  const originalFetch = globalThis.fetch;
  const pdf = new Blob(['%PDF-test'], { type: 'application/pdf' });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/brsp-meetings/7/draft.pdf');
    assert.equal(options.headers.Authorization, 'Bearer token');
    return { ok: true, status: 200, blob: async () => pdf };
  };
  try {
    const result = await dashboardRequest('/brsp-meetings/7/draft.pdf', {
      authToken: 'token', responseType: 'blob',
    });
    assert.equal(result, pdf);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
