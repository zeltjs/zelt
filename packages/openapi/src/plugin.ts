import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ZeltPlugin } from '@zeltjs/cli';

import type { GenerateOpenApiOptions, HttpMetadata } from './generate-openapi';
import { generateOpenApi } from './generate-openapi';

type HttpAppLike = {
  getMetadata: () => HttpMetadata;
};

export type OpenApiPluginOptions = {
  readonly entry?: string;
  readonly outDir?: string;
  readonly tsconfig?: string;
  readonly title?: string;
  readonly version?: string;
};

export const openapiPlugin = (options: OpenApiPluginOptions = {}): ZeltPlugin => ({
  name: 'openapi',
  async preBuild(ctx) {
    const entry = options.entry ?? ctx.config.entry;
    if (entry === undefined) {
      throw new Error('[openapi] entry is required. Set it in plugin options or config.entry');
    }

    const absPath = resolve(ctx.cwd, entry);
    const fileUrl = pathToFileURL(absPath).href;
    const mod: { app?: HttpAppLike; default?: HttpAppLike } = await import(fileUrl);
    const app = mod.app ?? mod.default;

    if (app === undefined || typeof app.getMetadata !== 'function') {
      throw new Error(`[openapi] Could not find app with getMetadata() in ${entry}`);
    }

    const generateOptions: GenerateOpenApiOptions = {
      distDir: options.outDir ?? './dist',
      ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
      ...(options.title !== undefined && { title: options.title }),
      ...(options.version !== undefined && { version: options.version }),
    };

    await generateOpenApi(app, generateOptions);
  },
});
