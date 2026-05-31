import type { HttpCapabilities, ReadyApp, ReadyOptions } from '@zeltjs/core';

import { CloudflareWorkersEnvAdaptor } from './cloudflare-workers-env.adaptor';

export type CloudflareWorkersOptions = {
  readonly warmup?: boolean;
};

type HttpReadyApp = ReadyApp & { readonly http: HttpCapabilities };

type HttpApp = {
  readonly ready: (options?: ReadyOptions) => Promise<HttpReadyApp>;
};

export type CloudflareWorkersApp = {
  readonly get: HttpReadyApp['get'];
  readonly fetch: (request: Request, env: unknown, ctx: ExecutionContext) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

export const onCloudflareWorkers = async (
  app: HttpApp,
  options: CloudflareWorkersOptions = {},
): Promise<CloudflareWorkersApp> => {
  const readyApp = await app.ready({
    fallbackConfigs: [CloudflareWorkersEnvAdaptor],
    warmup: options.warmup ?? false,
  });

  const fetch = async (
    request: Request,
    _env: unknown,
    ctx: ExecutionContext,
  ): Promise<Response> => {
    const response = readyApp.http.fetch(request);
    ctx.waitUntil(response.then(() => {}));
    return response;
  };

  return { get: readyApp.get, fetch, shutdown: readyApp.shutdown };
};
