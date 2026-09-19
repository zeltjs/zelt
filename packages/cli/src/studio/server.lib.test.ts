import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { AnalyzeResult } from './analyzer-runner.lib';
import type { StudioServer } from './server.lib';
import { startStudioServer } from './server.lib';

const okResult: AnalyzeResult = {
  ok: true,
  graph: { version: 3, nodes: [], edges: [], tests: [] },
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
      cwd: process.cwd(),
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
      cwd: process.cwd(),
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
      cwd: process.cwd(),
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
      cwd: process.cwd(),
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
      cwd: process.cwd(),
      analyze: () => Promise.resolve(okResult),
    });
    const res = await fetch(`${server.url}/..%2f..%2fetc%2fpasswd`);
    expect(res.status).toBe(404);
  });

  it('responds 400 to malformed percent-encoding instead of hanging', async () => {
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      cwd: process.cwd(),
      analyze: () => Promise.resolve(okResult),
    });
    const res = await fetch(`${server.url}/%zz`);
    expect(res.status).toBe(400);
  });

  it('rejects startup when the port is already in use', async () => {
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      cwd: process.cwd(),
      analyze: () => Promise.resolve(okResult),
    });
    const port = Number(new URL(server.url).port);
    await expect(
      startStudioServer({
        port,
        staticDir: makeStaticDir(),
        cwd: process.cwd(),
        analyze: () => Promise.resolve(okResult),
      }),
    ).rejects.toThrow();
  });

  it('rejects cross-site POST /api/reload with a foreign Origin and does not re-analyze', async () => {
    let calls = 0;
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      cwd: process.cwd(),
      analyze: () => {
        calls += 1;
        return Promise.resolve(okResult);
      },
    });
    const res = await fetch(`${server.url}/api/reload`, {
      method: 'POST',
      headers: { Origin: 'http://evil.example' },
    });
    expect(res.status).toBe(403);
    // 起動時の1回のみ。Origin 拒否で analyzeOnce() が呼ばれていない
    expect(calls).toBe(1);
  });

  it('allows POST /api/reload with a foreign Origin when the x-zelt-studio header is present', async () => {
    // ポートフォワード経由（Origin が localhost 以外）でも、preflight を要求する
    // カスタムヘッダ付きなら正規 UI からのリクエストとして通る
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      cwd: process.cwd(),
      analyze: () => Promise.resolve(okResult),
    });
    const res = await fetch(`${server.url}/api/reload`, {
      method: 'POST',
      headers: { Origin: 'https://forwarded-4400.example.dev', 'x-zelt-studio': 'reload' },
    });
    expect(res.status).toBe(200);
  });

  it('allows POST /api/reload with a same-origin localhost Origin', async () => {
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      cwd: process.cwd(),
      analyze: () => Promise.resolve(okResult),
    });
    const res = await fetch(`${server.url}/api/reload`, {
      method: 'POST',
      headers: { Origin: server.url },
    });
    expect(res.status).toBe(200);
  });

  it('allows POST /api/reload when no Origin header is present (e.g. curl)', async () => {
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      cwd: process.cwd(),
      analyze: () => Promise.resolve(okResult),
    });
    const res = await fetch(`${server.url}/api/reload`, { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('coalesces concurrent reloads into a single analysis', async () => {
    let calls = 0;
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      cwd: process.cwd(),
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

// /api/source は解析済みグラフの filePath に載っているファイルだけを配信する(allowlist)。
// 'subdir'/'escape.ts' は実ファイルではなく、allowlist を通過した後の
// isFile() チェック・symlink escape チェックそれぞれを単独で検証するための架空のエントリ
const sourceOkResult: AnalyzeResult = {
  ok: true,
  graph: {
    version: 3,
    nodes: [
      {
        id: 'greet.ts#greet',
        name: 'greet',
        filePath: 'greet.ts',
        module: '.',
        fileKind: null,
        decorators: [],
        contract: { params: [], returnType: 'string' },
        visibility: 'public',
        loc: { start: 1, end: 3 },
      },
      {
        id: 'subdir#dummy',
        name: 'dummy',
        filePath: 'subdir',
        module: '.',
        fileKind: null,
        decorators: [],
        contract: { params: [], returnType: 'void' },
        visibility: 'public',
        loc: { start: 1, end: 1 },
      },
      {
        id: 'escape.ts#dummy',
        name: 'dummy',
        filePath: 'escape.ts',
        module: '.',
        fileKind: null,
        decorators: [],
        contract: { params: [], returnType: 'void' },
        visibility: 'public',
        loc: { start: 1, end: 1 },
      },
      {
        // レビュー再指摘7(d): allowlist には載っているが実ファイルを作らない、ENOENT を
        // 単独で再現するためのエントリ(makeSourceDir は 'missing.ts' を書き出さない)
        id: 'missing.ts#dummy',
        name: 'dummy',
        filePath: 'missing.ts',
        module: '.',
        fileKind: null,
        decorators: [],
        contract: { params: [], returnType: 'void' },
        visibility: 'public',
        loc: { start: 1, end: 1 },
      },
      {
        // レビュー再指摘7(c): 1行が極端に長いファイル用。行数は1行のみ(MAX_SOURCE_LINES
        // には引っかからない)だが、JSON化後のレスポンス本体が MAX_RESPONSE_BYTES を超える
        id: 'huge.ts#dummy',
        name: 'dummy',
        filePath: 'huge.ts',
        module: '.',
        fileKind: null,
        decorators: [],
        contract: { params: [], returnType: 'void' },
        visibility: 'public',
        loc: { start: 1, end: 1 },
      },
    ],
    edges: [],
    tests: [],
  },
};

const makeSourceDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'zelt-studio-src-'));
  writeFileSync(
    join(dir, 'greet.ts'),
    ['export const greet = (): string => {', "  return 'hello';", '};', ''].join('\n'),
  );
  return dir;
};

describe('GET /api/source', () => {
  it('returns the requested line range of a cwd-relative file that appears in the graph', async () => {
    const cwd = makeSourceDir();
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(sourceOkResult),
      cwd,
    });
    const res = await fetch(`${server.url}/api/source?file=greet.ts&start=1&end=3`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      content: ['export const greet = (): string => {', "  return 'hello';", '};'].join('\n'),
    });
  });

  it('rejects a ".." path segment with 400, even when it still resolves inside cwd (レビュー再指摘7a)', async () => {
    const cwd = makeSourceDir();
    mkdirSync(join(cwd, 'sub'));
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(sourceOkResult),
      cwd,
    });
    // 'sub/../greet.ts' は resolve 後は cwd 内の greet.ts を指すが、".." セグメントを含む
    // 時点で許可判定(allowlist 含む)より先に一律 400 にする(結果整合な正規化を信用しない)
    const res = await fetch(
      `${server.url}/api/source?file=${encodeURIComponent('sub/../greet.ts')}&start=1&end=1`,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a path that traverses outside cwd with 400 (レビュー再指摘7a)', async () => {
    const cwd = makeSourceDir();
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(sourceOkResult),
      cwd,
    });
    const res = await fetch(
      `${server.url}/api/source?file=${encodeURIComponent('../../etc/passwd')}&start=1&end=1`,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a percent-encoded traversal sequence with 400 (レビュー再指摘7a)', async () => {
    const cwd = makeSourceDir();
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(sourceOkResult),
      cwd,
    });
    // encodeURIComponent 経由(上のテスト)ではなく、'.'/'/' を個別にパーセントエンコードした
    // 生の文字列で同じ攻撃を試す。fetch の URL パーサが 1 段階デコードした後も
    // ".." セグメント検出がデコード方法によらず弾けることを確認する
    const res = await fetch(
      `${server.url}/api/source?file=%2e%2e%2f%2e%2e%2fetc%2fpasswd&start=1&end=1`,
    );
    expect(res.status).toBe(400);
  });

  it('rejects an absolute path (which resolves outside cwd) with 403 (レビュー再指摘7b)', async () => {
    const cwd = makeSourceDir();
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(sourceOkResult),
      cwd,
    });
    // ".." を含まない絶対パスは cwd 外へのアクセス試行として 403(400 の「不正な形式」とは
    // 区別する。spec の意図に合わせる)
    const res = await fetch(
      `${server.url}/api/source?file=${encodeURIComponent('/etc/passwd')}&start=1&end=1`,
    );
    expect(res.status).toBe(403);
  });

  it('rejects a symlink that resolves outside cwd with 403 (レビュー再指摘7b)', async () => {
    const cwd = makeSourceDir();
    const outside = mkdtempSync(join(tmpdir(), 'zelt-studio-outside-'));
    writeFileSync(join(outside, 'secret.ts'), 'export const secret = 1;\n');
    symlinkSync(join(outside, 'secret.ts'), join(cwd, 'escape.ts'));
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(sourceOkResult),
      cwd,
    });
    // 文字列としては cwd 相対でも、symlink の実体(realpath)が cwd の外を指す場合は拒否する
    // (isWithinRoot の resolve 後の前方一致だけでは symlink を辿った先を検出できない)
    const res = await fetch(`${server.url}/api/source?file=escape.ts&start=1&end=1`);
    expect(res.status).toBe(403);
  });

  it('rejects a directory path with 400', async () => {
    const cwd = makeSourceDir();
    mkdirSync(join(cwd, 'subdir'));
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(sourceOkResult),
      cwd,
    });
    const res = await fetch(`${server.url}/api/source?file=subdir&start=1&end=1`);
    expect(res.status).toBe(400);
  });

  it('returns 404 when an allowlisted file does not actually exist on disk (レビュー再指摘7d)', async () => {
    // 'missing.ts' は sourceOkResult の allowlist には載っているが makeSourceDir が
    // 実ファイルを作らない。allowlist チェックでは弾かれず、realpath の ENOENT 分岐まで
    // 到達して 404 になることを確認する(下の「グラフに無いファイル」テストとは別の経路)
    const cwd = makeSourceDir();
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(sourceOkResult),
      cwd,
    });
    const res = await fetch(`${server.url}/api/source?file=missing.ts&start=1&end=1`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a file that exists under cwd but is not part of the current graph', async () => {
    const cwd = makeSourceDir();
    // レビュー指摘7: allowlist はグラフの filePath 集合のみ。cwd 相対で実在しても
    // グラフに無いファイルは追跡対象外として 404 にする(存在有無を漏らすオラクルに
    // しないため、not-found/traversal と同じ 404 に統一する)
    writeFileSync(join(cwd, 'other.ts'), 'export const other = 1;\n');
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(sourceOkResult),
      cwd,
    });
    const res = await fetch(`${server.url}/api/source?file=other.ts&start=1&end=1`);
    expect(res.status).toBe(404);
  });

  it('rejects an oversized line range with 413', async () => {
    const cwd = makeSourceDir();
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(sourceOkResult),
      cwd,
    });
    // レビュー指摘7: end - start が上限(MAX_SOURCE_LINES)を超えるリクエストは、
    // ファイルを開く前に弾く(巨大な end を投げるだけで無制限に読み取らせない)
    const res = await fetch(`${server.url}/api/source?file=greet.ts&start=1&end=1000000`);
    expect(res.status).toBe(413);
  });

  it('rejects an oversized response body with 413 even when the line count is within limits (レビュー再指摘7c)', async () => {
    const cwd = makeSourceDir();
    // 1行だけだが 600,000 文字(600,000 バイト超)あり、MAX_SOURCE_LINES(2000)は超えないが
    // JSON 化後のレスポンス本体は MAX_RESPONSE_BYTES(500,000) を超える
    writeFileSync(join(cwd, 'huge.ts'), `${'a'.repeat(600_000)}\n`);
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(sourceOkResult),
      cwd,
    });
    const res = await fetch(`${server.url}/api/source?file=huge.ts&start=1&end=1`);
    expect(res.status).toBe(413);
  });

  it('rejects a cross-site request the same way /api/reload does', async () => {
    const cwd = makeSourceDir();
    server = await startStudioServer({
      port: 0,
      staticDir: makeStaticDir(),
      analyze: () => Promise.resolve(sourceOkResult),
      cwd,
    });
    const res = await fetch(`${server.url}/api/source?file=greet.ts&start=1&end=1`, {
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });
});
