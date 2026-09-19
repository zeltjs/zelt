import { open, readFile, realpath } from 'node:fs/promises';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, isAbsolute, resolve, sep } from 'node:path';

import { match } from 'ts-pattern';

import type { AnalyzeResult } from './analyzer-runner.lib';

const CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.json', 'application/json'],
  ['.map', 'application/json'],
]);

export type StudioServer = {
  readonly url: string;
  readonly close: () => Promise<void>;
};

export type StartStudioServerOptions = {
  readonly port: number;
  readonly staticDir: string;
  readonly analyze: () => Promise<AnalyzeResult>;
  readonly cwd: string;
};

const respondJson = (res: ServerResponse, body: unknown): void => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const respondEmpty = (res: ServerResponse, status: number): void => {
  res.writeHead(status);
  res.end();
};

const isWithinRoot = (root: string, filePath: string): boolean =>
  filePath === root || filePath.startsWith(root + sep);

const serveStaticFile = async (
  staticRoot: string,
  pathname: string,
  res: ServerResponse,
): Promise<void> => {
  const decodedPathname = decodeURIComponent(pathname);
  const relPath = decodedPathname === '/' ? 'index.html' : decodedPathname.slice(1);
  const filePath = resolve(staticRoot, relPath);
  // staticDir の外へ抜ける参照は配信しない（resolve 後の前方一致で判定）
  if (!isWithinRoot(staticRoot, filePath)) {
    respondEmpty(res, 404);
    return;
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      'content-type': CONTENT_TYPES.get(extname(filePath)) ?? 'application/octet-stream',
    });
    res.end(content);
  } catch {
    respondEmpty(res, 404);
  }
};

type AnalyzeOnce = () => Promise<AnalyzeResult>;

const createAnalyzeOnce = (analyze: () => Promise<AnalyzeResult>): AnalyzeOnce => {
  // 同時 reload は進行中の解析に相乗りさせ、古い結果による上書き（結果の逆転）を防ぐ
  let inFlight: Promise<AnalyzeResult> | undefined;
  return () => {
    inFlight ??= analyze().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };
};

type RequestState = { latest: AnalyzeResult };

// POST /api/reload はユーザーコードを実行する解析を起動するため、simple request
// （preflight なし）による cross-site 起動を防ぐ。カスタムヘッダ付き POST は
// cross-site だと CORS preflight を通過できない（このサーバは preflight を許可しない）
// ため、ヘッダの存在自体が正規 UI からの same-origin リクエストである証明になり、
// ポートフォワード等で Origin が localhost 以外になる環境でも reload できる。
// Origin ヘッダ自体が無いリクエスト（curl 等のブラウザ外クライアント）と
// loopback Origin は既存挙動どおり許可する
export const isAllowedReloadRequest = (
  origin: string | string[] | undefined,
  reloadHeader: string | string[] | undefined,
): boolean => {
  if (reloadHeader !== undefined) return true;
  if (origin === undefined) return true;
  if (Array.isArray(origin)) return false;
  try {
    // URL.hostname は [::1] を ::1 に正規化する
    const hostname = new URL(origin).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
};

const respondText = (res: ServerResponse, status: number, body: string): void => {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
};

const parseLineParam = (value: string | null): number | undefined => {
  if (value === null) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
};

// 1リクエストで返す行数、読み取り対象ファイル自体のバイト数、および JSON 化後の
// レスポンス本体のバイト数、それぞれの上限。超過時は 413
// (ファイルを開く前・全文読み込み前に判定できるものは開く前に弾く)
const MAX_SOURCE_LINES = 2000;
const MAX_SOURCE_BYTES = 2_000_000;
// レビュー再指摘7(c): stats.size(ファイル全体)だけでなく、実際に slice して JSON化した
// レスポンス本体にも上限を設ける(1行が極端に長い行を大量に含むファイルへの対策)
const MAX_RESPONSE_BYTES = 500_000;

// fs の例外は Error 自体に code を持たないため、構造的型で受ける
// (studio.command.ts の errorCode と同じ手法。in 演算子・as 断言を避ける。
// モジュール跨ぎの小さな判定ヘルパーは共有せず各ファイルで再定義する、という
// 既存コードベースの方針に合わせてこのファイル内に閉じて定義する)
const fsErrorCode = (error: Error): unknown => {
  const record: { message: string; code?: unknown } = error;
  return record.code;
};

// /api/source は解析済みグラフの filePath に載っているファイルだけを配信する(allowlist)。
// cwd 相対で実在しても、グラフに無いファイルは追跡対象外として拒否する
const allowedFilePaths = (result: AnalyzeResult): ReadonlySet<string> => {
  if (!result.ok) return new Set();
  const paths = result.graph.nodes.flatMap((node) =>
    match(node)
      .with({ external: true }, () => [])
      .otherwise((n) => [n.filePath]),
  );
  return new Set(paths);
};

type SourceRequestParams = { readonly file: string; readonly start: number; readonly end: number };

const parseSourceRequestParams = (url: URL): SourceRequestParams | undefined => {
  const file = url.searchParams.get('file');
  const start = parseLineParam(url.searchParams.get('start'));
  const end = parseLineParam(url.searchParams.get('end'));
  if (file === null || start === undefined || end === undefined || start > end) return undefined;
  return { file, start, end };
};

type PathCheckResult =
  | { ok: true; readonly filePath: string }
  | { ok: false; readonly status: 400 | 403 | 404 };

// ファイルを開く前に文字列だけで判定できる経路(traversal 表記・allowlist)をまとめる
// (handleSourceRequest 自体の分岐数を減らすための抽出。ロジックは変えない)
const checkSourcePath = (cwdRoot: string, state: RequestState, file: string): PathCheckResult => {
  // レビュー再指摘7(a): `..` セグメントはそれ単体で明示的に 400(allowlist 判定より先)。
  // resolve 後の containment チェックだけに頼ると、cwd 内に収まる `..`(例: `a/../greet.ts`)を
  // 素通りさせてしまい、その後の allowlist 比較が生の文字列に対して行われるせいで
  // 「この種の traversal 表記は403/404のどちらに転ぶか曖昧」という状態になる。`..` は
  // 用途を問わず一律 400 にして曖昧さを無くす
  if (file.split('/').includes('..')) return { ok: false, status: 400 };
  const filePath = resolve(cwdRoot, file);
  // レビュー再指摘7(b): 絶対パス指定・cwd 外への解決は「フォーマット違反」ではなく
  // 「許可されていない場所へのアクセス試行」として 403 にする(spec の意図に合わせる。
  // symlink escape も同じ理由で 403)
  if (isAbsolute(file) || !isWithinRoot(cwdRoot, filePath)) return { ok: false, status: 403 };
  if (!allowedFilePaths(state.latest).has(file)) return { ok: false, status: 404 };
  return { ok: true, filePath };
};

type ReadRangeResult =
  | { ok: true; readonly body: string }
  | { ok: false; readonly status: 400 | 403 | 404 | 413 | 500; readonly message?: string };

// readSourceRange の catch 節の抽出(複雑度低減。ロジックは変えない)。ENOENT のみ
// 404(realpath/readFile が対象不在で投げる)、それ以外は fail-closed で 500 にする
const mapReadRangeError = (error: unknown): ReadRangeResult => {
  const isEnoent = error instanceof Error && fsErrorCode(error) === 'ENOENT';
  return isEnoent ? { ok: false, status: 404 } : { ok: false, status: 500 };
};

// realpath/open/fstat/読み取りという fs 依存の経路をまとめる(handleSourceRequest 自体の
// 分岐数を減らすための抽出。ロジックは変えない)
const readSourceRange = async (
  cwdRoot: string,
  filePath: string,
  start: number,
  end: number,
): Promise<ReadRangeResult> => {
  // レビュー指摘2(TOCTOU): realpath 解決後にパス文字列で stat→readFile を別々に行うと、
  // その間に対象が別ファイルへ差し替えられ得る(symlink の張り替え・ファイルの置換)。
  // realpath/allowlist チェックの後は同じディスクリプタに対して1度だけ open し、
  // 以降の fstat・読み取りはすべてそのディスクリプタ経由で行うことで、チェックした実体と
  // 読み取る実体が一致することを保証する
  let handle: import('node:fs/promises').FileHandle | undefined;
  try {
    // cwd 内に見える symlink の実体(realpath)が cwd の外を指すケース(symlink escape)を
    // resolve 後の文字列一致だけでは検出できないため、realpath で実体パスに解決してから
    // 再度 cwd 配下かどうかを確認する。realpath は対象が実在しないと ENOENT で例外になり、
    // 存在確認を兼ねる(その場合は下の catch で 404 になる)
    const [realFilePath, realCwdRoot] = await Promise.all([realpath(filePath), realpath(cwdRoot)]);
    if (!isWithinRoot(realCwdRoot, realFilePath)) {
      return { ok: false, status: 403 }; // レビュー再指摘7(b): symlink escape も 403
    }
    handle = await open(realFilePath, 'r');
    const stats = await handle.stat();
    if (!stats.isFile()) return { ok: false, status: 400, message: 'file must be a regular file' };
    if (stats.size > MAX_SOURCE_BYTES) {
      return { ok: false, status: 413, message: `File exceeds the ${MAX_SOURCE_BYTES}-byte limit` };
    }
    const content = await handle.readFile('utf-8');
    const lines = content.split('\n').slice(start - 1, end);
    const body = JSON.stringify({ content: lines.join('\n') });
    // レビュー再指摘7(c): stats.size(ファイル全体)のチェックだけでは、指定範囲が
    // 極端に長い行を大量に含む場合にレスポンス自体が肥大化しうる。JSON 化後の実サイズも見る
    if (Buffer.byteLength(body, 'utf-8') > MAX_RESPONSE_BYTES) {
      return {
        ok: false,
        status: 413,
        message: `Response exceeds the ${MAX_RESPONSE_BYTES}-byte limit`,
      };
    }
    return { ok: true, body };
  } catch (error) {
    return mapReadRangeError(error);
  } finally {
    await handle?.close();
  }
};

const respondReadRangeFailure = (
  res: ServerResponse,
  failure: Extract<ReadRangeResult, { ok: false }>,
): void => {
  if (failure.message !== undefined) {
    respondText(res, failure.status, failure.message);
    return;
  }
  respondEmpty(res, failure.status);
};

const handleSourceRequest = async (
  cwdRoot: string,
  state: RequestState,
  url: URL,
  res: ServerResponse,
): Promise<void> => {
  const params = parseSourceRequestParams(url);
  if (params === undefined) {
    respondText(res, 400, 'Invalid file/start/end parameters');
    return;
  }
  const { file, start, end } = params;
  if (end - start + 1 > MAX_SOURCE_LINES) {
    respondText(res, 413, `Requested line range exceeds the ${MAX_SOURCE_LINES}-line limit`);
    return;
  }
  const pathCheck = checkSourcePath(cwdRoot, state, file);
  if (!pathCheck.ok) {
    respondEmpty(res, pathCheck.status);
    return;
  }
  const rangeResult = await readSourceRange(cwdRoot, pathCheck.filePath, start, end);
  if (!rangeResult.ok) {
    respondReadRangeFailure(res, rangeResult);
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(rangeResult.body);
};

// /api/reload・/api/source 共通の Origin 検証(isAllowedReloadRequest)。true を返したら
// 呼び出し元は処理を打ち切ってよい(403 は既に書き込み済み)
const rejectIfForbiddenOrigin = (req: IncomingMessage, res: ServerResponse): boolean => {
  if (isAllowedReloadRequest(req.headers.origin, req.headers['x-zelt-studio'])) return false;
  respondEmpty(res, 403);
  return true;
};

type Route = { readonly method: string; readonly pathname: string };

// ルーティングを if/else の羅列ではなく match の分岐にまとめることで、
// handleRequest 自体の cyclomatic complexity を上げずに新しいエンドポイントを追加できる
// (build-graph.lib.ts の判別共用体絞り込みと同じ考え方)
const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  staticRoot: string,
  cwdRoot: string,
  analyzeOnce: AnalyzeOnce,
  state: RequestState,
): Promise<void> => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route: Route = { method: req.method ?? '', pathname: url.pathname };

  await match(route)
    .with({ method: 'GET', pathname: '/api/graph' }, async () => {
      respondJson(res, state.latest);
    })
    .with({ method: 'POST', pathname: '/api/reload' }, async () => {
      if (rejectIfForbiddenOrigin(req, res)) return;
      state.latest = await analyzeOnce();
      respondJson(res, state.latest);
    })
    .with({ method: 'GET', pathname: '/api/source' }, async () => {
      if (rejectIfForbiddenOrigin(req, res)) return;
      await handleSourceRequest(cwdRoot, state, url, res);
    })
    .otherwise(async () => {
      await serveStaticFile(staticRoot, url.pathname, res);
    });
};

const listen = (server: Server, port: number): Promise<void> =>
  new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    // /api/reload はユーザーコードを実行する解析を起動するため loopback のみに bind する
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', rejectPromise);
      resolvePromise();
    });
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) rejectPromise(error);
      else resolvePromise();
    });
  });

/**
 * @throws {Error} from server.lib.ts:listeningAddress
 */
const listeningAddress = (server: Server): AddressInfo => {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Failed to determine the studio server address');
  }
  return address;
};

/**
 * @throws {Error} from server.lib.ts:listeningAddress
 */
export const startStudioServer = async (
  options: StartStudioServerOptions,
): Promise<StudioServer> => {
  const analyzeOnce = createAnalyzeOnce(options.analyze);
  const state: RequestState = { latest: await analyzeOnce() };
  const staticRoot = resolve(options.staticDir);
  const cwdRoot = resolve(options.cwd);

  const server = createServer((req, res) => {
    void handleRequest(req, res, staticRoot, cwdRoot, analyzeOnce, state).catch(() => {
      // 不正なパーセントエンコーディング等でもレスポンスを必ず返し、リクエストをハングさせない
      if (!res.headersSent) res.writeHead(400);
      res.end();
    });
  });

  await listen(server, options.port);

  const address = listeningAddress(server);
  return {
    url: `http://localhost:${address.port}`,
    close: () => closeServer(server),
  };
};
