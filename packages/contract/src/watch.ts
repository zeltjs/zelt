import { resolve } from 'node:path';

import chokidar from 'chokidar';

import type { GenerateClientOptions } from './config/options';
import { generateClient } from './generate-client';

export const watchClient = async (options: GenerateClientOptions): Promise<() => Promise<void>> => {
  // 監視対象: { class, source } を併記している controller の source path のみ。
  // bare class は generateClient 側で throw されるため事実上 source 必須。
  const watchedPaths: string[] = [];
  for (const c of options.controllers) {
    if (typeof c !== 'function') watchedPaths.push(resolve(c.source));
  }

  // Initial run
  await generateClient(options);

  const watcher = chokidar.watch(watchedPaths, { ignoreInitial: true });
  watcher.on('change', (path) => {
    void (async (): Promise<void> => {
      try {
        const result = await generateClient(options);
        console.log(
          `[koya-contract] regenerated (app.gen.ts ${result.appGenChanged ? 'changed' : 'unchanged'}, openapi.json ${result.openApiChanged ? 'changed' : 'unchanged'}) — trigger: ${path}`,
        );
      } catch (e) {
        console.error('[koya-contract] regeneration failed:', e);
      }
    })();
  });

  return async (): Promise<void> => {
    await watcher.close();
  };
};
