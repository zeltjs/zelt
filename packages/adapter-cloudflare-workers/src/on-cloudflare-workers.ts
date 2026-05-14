import type {
  ControllerRouteInfo,
  HttpApp,
  HttpMetadata,
  ReadyOptions,
  ReadyResult,
} from '@zeltjs/core';

import { CloudflareWorkersEnvConfig } from './cloudflare-workers-env.config';

export type { ControllerRouteInfo, HttpMetadata };

export type DynamicMeta = HttpMetadata;

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
    const __dynamicMeta = app.getMetadata();
    return { ...base, __dynamicMeta };
  }

  return base;
};
