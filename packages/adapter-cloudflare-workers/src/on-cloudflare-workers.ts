import { type HttpApp, type ReadyOptions, type ReadyResult } from '@zeltjs/core';

import { CloudflareWorkersEnvConfig } from './cloudflare-workers-env.config';

export type CloudflareWorkersOptions = {
  readonly warmup?: boolean;
};

export type CloudflareWorkersApp = ReadyResult & {
  readonly fetch: (request: Request, env: unknown, ctx: ExecutionContext) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
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

  return { ...resolver, fetch, shutdown: app.shutdown };
};
