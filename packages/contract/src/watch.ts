import chokidar from 'chokidar';
import fg from 'fast-glob';

import type { GenerateClientOptions } from './config/options';
import { generateClient } from './generate-client';

export const watchClient = async (options: GenerateClientOptions): Promise<() => Promise<void>> => {
  const watchedPaths = fg.sync([...options.controllers], { absolute: true });

  await generateClient(options);

  const watcher = chokidar.watch(watchedPaths, { ignoreInitial: true });
  watcher.on('change', (path) => {
    void (async (): Promise<void> => {
      try {
        const result = await generateClient(options);
        console.log(
          `[zelt-openapi] regenerated (app.gen.ts ${result.appGenChanged ? 'changed' : 'unchanged'}, openapi.json ${result.openApiChanged ? 'changed' : 'unchanged'}) — trigger: ${path}`,
        );
      } catch (e) {
        console.error('[zelt-openapi] regeneration failed:', e);
      }
    })();
  });

  return async (): Promise<void> => {
    await watcher.close();
  };
};
