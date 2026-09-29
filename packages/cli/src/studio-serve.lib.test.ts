import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { StudioServer } from './studio-serve.lib';
import { startStudioServer } from './studio-serve.lib';

// snapshot の schema 検証は studio-extract と studio-ui が持つ。ここで見るのは
// 「渡した JSON をそのまま返す」ことだけなので、型も schema も持ち込まない
// (配信された .d.ts の StudioSnapshot は valibot の推論が深すぎて TS2589 になる)
const snapshot = {
  schemaVersion: 1,
  snapshotId: 'a'.repeat(64),
  project: { id: 'demo', name: 'Demo' },
  provenance: 'extracted',
  graph: { groups: [], presentation: { id: 'demo', columns: [] } },
};
const snapshotJson = JSON.stringify(snapshot);

// cli の build が同梱する UI。`GET /` が実際の vite build 成果物を返すことを確かめる
const packagedUiDir = resolve(__dirname, '../dist/studio-ui');

let server: StudioServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

const makeStaticDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'zelt-studio-serve-'));
  writeFileSync(join(dir, 'index.html'), '<html><body>studio</body></html>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'index.css'), 'body{}');
  return dir;
};

type HttpResponse = {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
};

// fetch は Host を差し替えられないため、ヘッダを完全に指定できる node:http で叩く
const call = (url: string, headers: Readonly<Record<string, string>> = {}): Promise<HttpResponse> =>
  new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(url, { headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        body += chunk;
      });
      res.on('end', () => {
        resolvePromise({ status: res.statusCode ?? 0, headers: res.headers, body });
      });
    });
    req.on('error', rejectPromise);
    req.end();
  });

const startOn = async (staticDir: string): Promise<StudioServer> => {
  server = await startStudioServer({ port: 0, staticDir, snapshotJson });
  return server;
};

describe('startStudioServer', () => {
  it('serves index.html at /', async () => {
    const started = await startOn(makeStaticDir());
    const res = await call(`${started.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('studio');
  });

  it('serves the studio UI that the cli build bundles into dist', async () => {
    const started = await startOn(packagedUiDir);
    const res = await call(`${started.url}/`);
    // dist が無いと 404 になる。build 前に走らせたことが分かるようメッセージを添える
    expect(res.status, `run the @zeltjs/cli build first (${packagedUiDir})`).toBe(200);
    expect(res.body).toContain('<div id="root"></div>');
  });

  it('returns the in-memory snapshot on /snapshot.json', async () => {
    const started = await startOn(makeStaticDir());
    const res = await call(`${started.url}/snapshot.json`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    const body: unknown = JSON.parse(res.body);
    expect(body).toEqual(snapshot);
  });

  it('rejects path traversal with 404', async () => {
    const started = await startOn(makeStaticDir());
    const res = await call(`${started.url}/..%2f..%2fetc%2fpasswd`);
    expect(res.status).toBe(404);
  });

  it('responds 400 to malformed percent-encoding instead of hanging', async () => {
    const started = await startOn(makeStaticDir());
    const res = await call(`${started.url}/%zz`);
    expect(res.status).toBe(400);
  });

  it('rejects a symlink whose target escapes the static dir with 403', async () => {
    const staticDir = makeStaticDir();
    const outside = mkdtempSync(join(tmpdir(), 'zelt-studio-outside-'));
    writeFileSync(join(outside, 'secret.html'), '<html>secret</html>');
    symlinkSync(join(outside, 'secret.html'), join(staticDir, 'escape.html'));
    const started = await startOn(staticDir);
    const res = await call(`${started.url}/escape.html`);
    expect(res.status).toBe(403);
  });

  it('rejects startup when the port is already in use', async () => {
    const started = await startOn(makeStaticDir());
    await expect(
      startStudioServer({ port: started.address.port, staticDir: makeStaticDir(), snapshotJson }),
    ).rejects.toThrow();
  });

  it('binds to the loopback address only', async () => {
    const started = await startOn(makeStaticDir());
    expect(started.address.address).toBe('127.0.0.1');
  });

  it('rejects a request whose Host is not a loopback name with 403', async () => {
    const started = await startOn(makeStaticDir());
    const res = await call(`${started.url}/snapshot.json`, { host: 'evil.example' });
    expect(res.status).toBe(403);
    expect(res.body).toBe('');
  });

  it('never sends CORS headers', async () => {
    const started = await startOn(makeStaticDir());
    const res = await call(`${started.url}/snapshot.json`, { origin: 'http://evil.example' });
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
