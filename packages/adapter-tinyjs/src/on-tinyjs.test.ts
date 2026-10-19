import { createApp, HttpFeature, http } from '@zeltjs/core';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { onTinyjs } from './on-tinyjs';

afterEach(() => vi.unstubAllGlobals());

describe('onTinyjs', () => {
  it('returns common runtime operations without adding a native bridge', async () => {
    vi.stubGlobal('tjs', { env: {} });
    const app = await onTinyjs(createApp([]));
    expectTypeOf(app).not.toHaveProperty('api');
    expectTypeOf(app).not.toHaveProperty('init');
    expectTypeOf(app).not.toHaveProperty('tinyjsBridge');
    expect(Object.keys(app).sort()).toEqual([
      'features',
      'get',
      'getFeatureEntries',
      'hasFeature',
      'registerShutdown',
      'shutdown',
    ]);
    await app.shutdown();
  });

  it('preserves HTTP features named api and init without adding operations to them', async () => {
    vi.stubGlobal('tjs', { env: {} });
    const app = await onTinyjs(
      createApp([http({ name: 'api', controllers: [] }), http({ name: 'init', controllers: [] })]),
    );
    try {
      const entries = app.getFeatureEntries(HttpFeature);
      expect(entries.find((entry) => entry.key === 'api')?.capabilities).toBe(app.api);
      expect(entries.find((entry) => entry.key === 'init')?.capabilities).toBe(app.init);
      expect((await app.api.request('/')).status).toBe(404);
      expect((await app.init.request('/')).status).toBe(404);
    } finally {
      await app.shutdown();
    }
  });
});
