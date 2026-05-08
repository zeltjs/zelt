import { EnvConfig, type HttpApp, type ReadyOptions } from '@zeltjs/core';

import { CloudflareWorkersEnvConfig } from './cloudflare-workers-env.config';

export type CloudflareWorkersOptions = {
  readonly warmup?: boolean;
};

export type CloudflareWorkersHandle = {
  readonly fetch: (request: Request, env: unknown, ctx: ExecutionContext) => Promise<Response>;
};

export const onCloudflareWorkers = (
  app: HttpApp,
  options: CloudflareWorkersOptions = {},
): CloudflareWorkersHandle => {
  let readyPromise: Promise<void> | undefined;

  const ensureReady = (): Promise<void> => {
    if (!readyPromise) {
      if (app.hasConfig(EnvConfig)) {
        app.replaceConfig(EnvConfig, CloudflareWorkersEnvConfig);
      }
      const readyOptions: ReadyOptions = { warmup: options.warmup ?? false };
      readyPromise = app.ready(readyOptions);
    }
    return readyPromise;
  };

  const fetch = async (
    request: Request,
    _env: unknown,
    ctx: ExecutionContext,
  ): Promise<Response> => {
    await ensureReady();
    const response = app.fetch(request);
    ctx.waitUntil(response.then(() => {}));
    return response;
  };

  return { fetch };
};
