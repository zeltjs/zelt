import { EnvConfig, type HttpApp, type ReadyOptions } from '@zeltjs/core';

import { CloudflareWorkersEnvConfig } from './cloudflare-workers-env.config';

export type CloudflareWorkersOptions = {
  readonly warmup?: boolean;
};

export type CloudflareWorkersApp = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => T;
  readonly fetch: (request: Request, env: unknown, ctx: ExecutionContext) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

export const onCloudflareWorkers = async (
  app: HttpApp,
  options: CloudflareWorkersOptions = {},
): Promise<CloudflareWorkersApp> => {
  if (app.hasConfig(EnvConfig)) {
    app.replaceConfig(EnvConfig, CloudflareWorkersEnvConfig);
  }

  const readyOptions: ReadyOptions = { warmup: options.warmup ?? false };
  const { get } = await app.ready(readyOptions);

  const fetch = async (
    request: Request,
    _env: unknown,
    ctx: ExecutionContext,
  ): Promise<Response> => {
    const response = app.fetch(request);
    ctx.waitUntil(response.then(() => {}));
    return response;
  };

  return { get, fetch, shutdown: app.shutdown };
};
