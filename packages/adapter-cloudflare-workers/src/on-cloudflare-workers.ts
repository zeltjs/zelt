import type { HttpApp, ReadyOptions, ReadyResult } from '@zeltjs/core';
import { getControllerMetadata } from '@zeltjs/core';

import { CloudflareWorkersEnvConfig } from './cloudflare-workers-env.config';

export type DynamicControllerMeta = {
  readonly basePath: string;
  readonly name: string;
  readonly sourceFile: string | undefined;
};

export type DynamicMeta = {
  readonly controllers: readonly DynamicControllerMeta[];
};

export type CloudflareWorkersOptions = {
  readonly warmup?: boolean;
  readonly dynamic?: boolean;
};

type BaseCloudflareWorkersApp = ReadyResult & {
  readonly fetch: (request: Request, env: unknown, ctx: ExecutionContext) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

export type CloudflareWorkersApp = BaseCloudflareWorkersApp & {
  readonly __dynamicMeta?: DynamicMeta;
};

const collectDynamicMeta = (
  controllers: readonly (new (...args: never[]) => object)[],
): DynamicMeta => {
  const controllerMetas = controllers.map((ctrl) => {
    const meta = getControllerMetadata(ctrl);
    return {
      basePath: meta?.basePath ?? '/',
      name: ctrl.name,
      sourceFile: meta?.sourceFile,
    };
  });
  return { controllers: controllerMetas };
};

export const onCloudflareWorkers = async (
  app: HttpApp,
  options: CloudflareWorkersOptions = {},
): Promise<CloudflareWorkersApp> => {
  app.addFallbackConfig(CloudflareWorkersEnvConfig);

  const readyOptions: ReadyOptions = { warmup: options.warmup ?? false };
  const resolver = await app.ready(readyOptions);

  const fetch = async (
    request: Request,
    _env: unknown,
    ctx: ExecutionContext,
  ): Promise<Response> => {
    const response = app.fetch(request);
    ctx.waitUntil(response.then(() => {}));
    return response;
  };

  const base: BaseCloudflareWorkersApp = { ...resolver, fetch, shutdown: app.shutdown };

  if (options.dynamic) {
    const __dynamicMeta = collectDynamicMeta(app.getControllers());
    return { ...base, __dynamicMeta };
  }

  return base;
};
