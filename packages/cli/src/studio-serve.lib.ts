import type { FileHandle } from 'node:fs/promises';
import { open, realpath } from 'node:fs/promises';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, resolve, sep } from 'node:path';

// 配信するのは vite build の成果物と snapshot だけなので、拡張子はこの表で足りる。
// 表に無い拡張子は octet-stream にして、ブラウザに解釈させない
const CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.json', 'application/json'],
  ['.map', 'application/json'],
  ['.woff2', 'font/woff2'],
  ['.ico', 'image/x-icon'],
  ['.png', 'image/png'],
]);

const SNAPSHOT_PATHNAME = '/snapshot.json';

// 開発者の手元だけに見せるサーバなので、待受は loopback に固定する
const BIND_ADDRESS = '127.0.0.1';

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

export type StudioServer = {
  readonly url: string;
  readonly address: AddressInfo;
  readonly close: () => Promise<void>;
};

export type StartStudioServerOptions = {
  readonly port: number;
  /** vite build の成果物 (index.html + assets) が入ったディレクトリ */
  readonly staticDir: string;
  /**
   * `/snapshot.json` の本文。サーバはファイルを持たず、渡された文字列を返すだけなので、
   * 抽出結果を JSON にするのは呼び出し側の役目
   */
  readonly snapshotJson: string;
};

const respondEmpty = (res: ServerResponse, status: number): void => {
  res.writeHead(status);
  res.end();
};

const isWithinRoot = (root: string, filePath: string): boolean =>
  filePath === root || filePath.startsWith(root + sep);

/**
 * Host ヘッダを loopback 名に限る。ブラウザは DNS rebinding で攻撃者のページを
 * 127.0.0.1 と同じ origin に見せられるが、その場合 Host には攻撃者のドメインが載るため、
 * ここで弾くとローカルの snapshot を外部ページから読み出せなくなる。
 */
const isLoopbackHost = (host: string | undefined): boolean => {
  if (host === undefined) return false;
  // IPv6 リテラルは `[::1]:4400` の形で来るので、括弧を閉じた位置までを hostname とする
  const closing = host.indexOf(']');
  const hostname =
    host.startsWith('[') && closing !== -1 ? host.slice(0, closing + 1) : host.split(':')[0];
  return hostname !== undefined && LOOPBACK_HOSTNAMES.has(hostname);
};

type PathResult =
  | { ok: true; readonly filePath: string }
  | { ok: false; readonly status: 400 | 404 };

const staticFilePath = (staticRoot: string, pathname: string): PathResult => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // `%zz` のような不正なパーセントエンコーディングは、リクエストをハングさせず 400 で切る
    return { ok: false, status: 400 };
  }
  const relPath = decoded === '/' ? 'index.html' : decoded.slice(1);
  const filePath = resolve(staticRoot, relPath);
  // staticDir の外へ抜ける参照は配信しない (resolve 後の前方一致で判定)
  if (!isWithinRoot(staticRoot, filePath)) return { ok: false, status: 404 };
  return { ok: true, filePath };
};

// fs の例外は Error 自体に code を持たないため、構造的型で受ける
// (in 演算子・as 断言を避けるための手法)
const fsErrorCode = (error: Error): unknown => {
  const record: { message: string; code?: unknown } = error;
  return record.code;
};

type FileResult =
  | { ok: true; readonly content: Buffer; readonly contentType: string }
  | { ok: false; readonly status: 403 | 404 | 500 };

// 存在しないものは 404、それ以外の読み取り失敗は中身を推測せず 500 にする
const readFailure = (error: unknown): Extract<FileResult, { ok: false }> => {
  const isEnoent = error instanceof Error && fsErrorCode(error) === 'ENOENT';
  return { ok: false, status: isEnoent ? 404 : 500 };
};

const readStaticFile = async (staticRoot: string, filePath: string): Promise<FileResult> => {
  let handle: FileHandle | undefined;
  try {
    // staticDir 内に見える symlink の実体が外を指すケースは、resolve 後の文字列一致だけでは
    // 検出できないため realpath で実体に解決してから配下かどうかを見る
    const [realFilePath, realRoot] = await Promise.all([realpath(filePath), realpath(staticRoot)]);
    if (!isWithinRoot(realRoot, realFilePath)) return { ok: false, status: 403 };
    // 確認した実体と配信する実体を一致させるため、以降の stat/読み取りは同じ
    // ディスクリプタ経由で行う (チェック後の差し替えを防ぐ)
    handle = await open(realFilePath, 'r');
    const stats = await handle.stat();
    if (!stats.isFile()) return { ok: false, status: 404 };
    const content = await handle.readFile();
    return {
      ok: true,
      content,
      contentType: CONTENT_TYPES.get(extname(realFilePath)) ?? 'application/octet-stream',
    };
  } catch (error) {
    return readFailure(error);
  } finally {
    await handle?.close();
  }
};

const serveStaticFile = async (
  staticRoot: string,
  pathname: string,
  res: ServerResponse,
): Promise<void> => {
  const path = staticFilePath(staticRoot, pathname);
  if (!path.ok) {
    respondEmpty(res, path.status);
    return;
  }
  const file = await readStaticFile(staticRoot, path.filePath);
  if (!file.ok) {
    respondEmpty(res, file.status);
    return;
  }
  res.writeHead(200, { 'content-type': file.contentType });
  res.end(file.content);
};

// CORS ヘッダは一切付けない。UI は同じ origin から配信されるので不要で、
// 付けると他 origin のページに snapshot を読ませてしまう
const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  staticRoot: string,
  snapshotJson: string,
): Promise<void> => {
  if (!isLoopbackHost(req.headers.host)) {
    respondEmpty(res, 403);
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === SNAPSHOT_PATHNAME) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(snapshotJson);
    return;
  }
  await serveStaticFile(staticRoot, url.pathname, res);
};

const listen = (server: Server, port: number): Promise<void> =>
  new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(port, BIND_ADDRESS, () => {
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
 * @throws {Error} from studio-serve.lib.ts:listeningAddress
 */
const listeningAddress = (server: Server): AddressInfo => {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Failed to determine the studio server address');
  }
  return address;
};

/**
 * @throws {Error} from studio-serve.lib.ts:listeningAddress
 */
export const startStudioServer = async (
  options: StartStudioServerOptions,
): Promise<StudioServer> => {
  const staticRoot = resolve(options.staticDir);

  const server = createServer((req, res) => {
    void handleRequest(req, res, staticRoot, options.snapshotJson).catch(() => {
      // 想定外の失敗でもレスポンスを返し、リクエストをハングさせない
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  await listen(server, options.port);
  const address = listeningAddress(server);
  return {
    url: `http://localhost:${address.port}`,
    address,
    close: () => closeServer(server),
  };
};
