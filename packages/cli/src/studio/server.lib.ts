import { readFile } from 'node:fs/promises';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, resolve, sep } from 'node:path';

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
};

const respondJson = (res: ServerResponse, body: AnalyzeResult): void => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const respondEmpty = (res: ServerResponse, status: number): void => {
  res.writeHead(status);
  res.end();
};

const isWithinStaticRoot = (staticRoot: string, filePath: string): boolean =>
  filePath === staticRoot || filePath.startsWith(staticRoot + sep);

const serveStaticFile = async (
  staticRoot: string,
  pathname: string,
  res: ServerResponse,
): Promise<void> => {
  const decodedPathname = decodeURIComponent(pathname);
  const relPath = decodedPathname === '/' ? 'index.html' : decodedPathname.slice(1);
  const filePath = resolve(staticRoot, relPath);
  // staticDir の外へ抜ける参照は配信しない（resolve 後の前方一致で判定）
  if (!isWithinStaticRoot(staticRoot, filePath)) {
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

const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  staticRoot: string,
  analyzeOnce: AnalyzeOnce,
  state: RequestState,
): Promise<void> => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/graph') {
    respondJson(res, state.latest);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/reload') {
    state.latest = await analyzeOnce();
    respondJson(res, state.latest);
    return;
  }

  await serveStaticFile(staticRoot, url.pathname, res);
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

  const server = createServer((req, res) => {
    void handleRequest(req, res, staticRoot, analyzeOnce, state).catch(() => {
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
