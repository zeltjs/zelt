import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { AnalyzeResult } from './analyzer-runner.lib';
import type { StudioServer } from './server.lib';
import { startStudioServer } from './server.lib';

const okResult: AnalyzeResult = {
  ok: true,
  graph: { version: 1, nodes: [], edges: [] },
};

let server: StudioServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

const makeStaticDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'zelt-studio-test-'));
  writeFileSync(join(dir, 'index.html'), '<html><body>studio</body></html>');
  return dir;
};

describe('startStudioServer', () => {
  it('serves the graph on /api/graph', async () => {
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(okResult),
    });
    const res = await fetch(`${server.url}/api/graph`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(okResult);
  });

  it('re-runs analysis on POST /api/reload', async () => {
    let calls = 0;
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => {
        calls += 1;
        return Promise.resolve(okResult);
      },
    });
    await fetch(`${server.url}/api/reload`, { method: 'POST' });
    // 起動時に1回 + reload で1回
    expect(calls).toBe(2);
  });

  it('serves index.html at /', async () => {
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(okResult),
    });
    const res = await fetch(`${server.url}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('studio');
  });

  it('keeps serving error results instead of crashing', async () => {
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve({ ok: false, errorOutput: 'boom' }),
    });
    const res = await fetch(`${server.url}/api/graph`);
    const body = (await res.json()) as AnalyzeResult;
    expect(body.ok).toBe(false);
  });

  it('rejects path traversal', async () => {
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(okResult),
    });
    const res = await fetch(`${server.url}/..%2f..%2fetc%2fpasswd`);
    expect(res.status).toBe(404);
  });

  it('responds 400 to malformed percent-encoding instead of hanging', async () => {
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(okResult),
    });
    const res = await fetch(`${server.url}/%zz`);
    expect(res.status).toBe(400);
  });

  it('rejects startup when the port is already in use', async () => {
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(okResult),
    });
    const port = Number(new URL(server.url).port);
    await expect(
      startStudioServer({
        port,
        staticDir: makeStaticDir(),
        analyze: () => Promise.resolve(okResult),
      }),
    ).rejects.toThrow();
  });

  it('coalesces concurrent reloads into a single analysis', async () => {
    let calls = 0;
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 50));
        return okResult;
      },
    });
    await Promise.all([
      fetch(`${server.url}/api/reload`, { method: 'POST' }),
      fetch(`${server.url}/api/reload`, { method: 'POST' }),
    ]);
    // 起動時 1 回 + 同時 reload 2 発は 1 回に集約
    expect(calls).toBe(2);
  });
});
