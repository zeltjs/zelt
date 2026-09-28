import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { defineConfig } from 'vite';

const SNAPSHOT_PATH = '/snapshot.json';
const FIXTURE_URL = new URL('test-fixtures/ec-backend.snapshot.json', import.meta.url);

/**
 * 本番の `snapshot.json` は `zelt studio` が抽出結果をメモリから返す。ここには配信側が居ないので、
 * dev / preview の間だけ同じ URL にテスト fixture を割り当てて UI 単体で開けるようにする。
 * build 成果物には含めない(publicDir も無効)。
 */
function serveFixtureSnapshot(): Plugin {
  const mount = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== SNAPSHOT_PATH) {
        next();
        return;
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(readFileSync(FIXTURE_URL));
    });
  };
  return {
    name: 'studio-ui:fixture-snapshot',
    configureServer: mount,
    configurePreviewServer: mount,
  };
}

export default defineConfig({
  base: './',
  // snapshot は配信側が返すもので、静的資産として同梱してはならない
  publicDir: false,
  plugins: [react(), serveFixtureSnapshot()],
  server: {
    allowedHosts: ['.trycloudflare.com'],
  },
});
