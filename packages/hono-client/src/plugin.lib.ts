import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { ZeltPlugin } from '@zeltjs/cli';
import type { HttpStaticCapabilities } from '@zeltjs/core';

import { emitAppType } from './generator';

type HttpStaticApp = {
  readonly http: HttpStaticCapabilities;
};

export type HonoClientPluginOptions = {
  readonly outDir?: string;
  readonly output?: string;
};

/** @throws {ZeltPluginConfigurationError | ZeltDecoratorUsageError} */
export const honoClientPlugin = (
  options: HonoClientPluginOptions = {},
): ZeltPlugin<HttpStaticApp> => ({
  name: 'hono-client',
  async preBuild(ctx) {
    const app = await ctx.loadStaticApp();
    const distDir = options.outDir ?? './generated';
    const outputFilename = options.output ?? 'app-type.ts';
    const outputPath = resolve(ctx.cwd, distDir, outputFilename);

    const content = emitAppType({
      metadata: app.http.getMetadata(),
      controllers: app.http.getControllers(),
      distDir: resolve(ctx.cwd, distDir),
    });

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');
  },
});
