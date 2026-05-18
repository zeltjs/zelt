import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ZeltPlugin } from '@zeltjs/cli';
import { ZeltPluginConfigurationError } from '@zeltjs/core';

import type { HttpAppLike } from './generator';
import { emitAppType } from './generator';

type AppModule = {
  app?: HttpAppLike;
  default?: HttpAppLike;
};

export type HonoClientPluginOptions = {
  readonly entry?: string;
  readonly outDir?: string;
  readonly output?: string;
};

/** @throws {ZeltPluginConfigurationError} */
const loadApp = async (cwd: string, entry: string): Promise<HttpAppLike> => {
  const absPath = resolve(cwd, entry);
  const fileUrl = pathToFileURL(absPath).href;
  const mod: AppModule = await import(fileUrl);
  const app = mod.app ?? mod.default;
  if (app === undefined || typeof app.getMetadata !== 'function') {
    throw new ZeltPluginConfigurationError({
      pluginName: 'hono-client',
      reason: 'app_not_found',
      details: entry,
    });
  }
  return app;
};

/** @throws {ZeltPluginConfigurationError | ZeltDecoratorUsageError} */
export const honoClientPlugin = (options: HonoClientPluginOptions = {}): ZeltPlugin => ({
  name: 'hono-client',
  async preBuild(ctx) {
    const entry = options.entry ?? ctx.config.entry;
    if (entry === undefined) {
      throw new ZeltPluginConfigurationError({
        pluginName: 'hono-client',
        reason: 'missing_entry',
      });
    }

    const app = await loadApp(ctx.cwd, entry);
    const distDir = options.outDir ?? './generated';
    const outputFilename = options.output ?? 'app-type.ts';
    const outputPath = resolve(ctx.cwd, distDir, outputFilename);

    const content = emitAppType(app.getMetadata(), resolve(ctx.cwd, distDir));

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');
  },
});
