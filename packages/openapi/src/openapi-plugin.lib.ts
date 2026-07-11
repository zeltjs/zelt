import type { ZeltPlugin } from '@zeltjs/cli';
import type { HttpStaticCapabilities } from '@zeltjs/core';

import type { GenerateOpenApiOptions } from './generate-openapi.lib';
import { generateOpenApi } from './generate-openapi.lib';
import type { SchemaResolver } from './resolve-schema.lib';
import type { SchemaAdapter } from './schema.types';

type HttpStaticApp = {
  readonly http: HttpStaticCapabilities;
};

export type OpenApiPluginOptions = {
  readonly outDir?: string;
  readonly tsconfig?: string;
  readonly title?: string;
  readonly version?: string;
  readonly schemaAdapter?: SchemaAdapter;
  readonly schemaResolver?: SchemaResolver;
};

const buildGenerateOptions = (options: OpenApiPluginOptions): GenerateOpenApiOptions => ({
  distDir: options.outDir ?? './dist',
  ...(options.tsconfig !== undefined && { tsconfig: options.tsconfig }),
  ...(options.title !== undefined && { title: options.title }),
  ...(options.version !== undefined && { version: options.version }),
  ...(options.schemaAdapter !== undefined && { schemaAdapter: options.schemaAdapter }),
  ...(options.schemaResolver !== undefined && { schemaResolver: options.schemaResolver }),
});

/** @throws {ZeltDecoratorUsageError | UnsupportedTypeScriptVersionError | Error} */
export const openapiPlugin = (options: OpenApiPluginOptions = {}): ZeltPlugin<HttpStaticApp> => ({
  name: 'openapi',
  async preBuild(ctx) {
    const app = await ctx.loadStaticApp();
    await generateOpenApi(app.http, buildGenerateOptions(options));
  },
});
