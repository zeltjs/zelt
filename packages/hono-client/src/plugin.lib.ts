import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ZeltPlugin } from '@zeltjs/cli';
import { ZeltPluginConfigurationError } from '@zeltjs/core';

import type { HttpAppLike } from './generator';
import { emitAppType } from './generator';

type HttpAppLikeWithControllers = HttpAppLike & {
  getControllers: () => readonly (new (...args: never[]) => object)[];
};

type AppModule = {
  app?: { http?: HttpAppLikeWithControllers } | HttpAppLikeWithControllers;
  default?: { http?: HttpAppLikeWithControllers } | HttpAppLikeWithControllers;
};

const resolveHttpApp = (mod: AppModule): HttpAppLikeWithControllers | undefined => {
  const exported = mod.app ?? mod.default;
  if (!exported) return undefined;

  if (typeof (exported as HttpAppLikeWithControllers).getMetadata === 'function') {
    return exported as HttpAppLikeWithControllers;
  }

  const namespaced = exported as { http?: HttpAppLikeWithControllers };
  if (namespaced.http && typeof namespaced.http.getMetadata === 'function') {
    return namespaced.http;
  }

  return undefined;
};

export type HonoClientPluginOptions = {
  readonly entry?: string;
  readonly outDir?: string;
  readonly output?: string;
};

/** @throws {ZeltPluginConfigurationError} */
const loadApp = async (cwd: string, entry: string): Promise<HttpAppLikeWithControllers> => {
  const absPath = resolve(cwd, entry);
  const fileUrl = pathToFileURL(absPath).href;
  const mod: AppModule = await import(fileUrl);
  const app = resolveHttpApp(mod);
  if (!app) {
    throw new ZeltPluginConfigurationError({
      pluginName: 'hono-client',
      reason: 'app_not_found',
      details: entry,
    });
  }
  if (typeof app.getControllers !== 'function') {
    throw new ZeltPluginConfigurationError({
      pluginName: 'hono-client',
      reason: 'app_not_found',
      details: `${entry} (missing getControllers)`,
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

    const content = emitAppType({
      metadata: app.getMetadata(),
      controllers: app.getControllers(),
      distDir: resolve(ctx.cwd, distDir),
    });

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');
  },
});
