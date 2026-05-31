import type {
  AppRequiring,
  ConfiguredFeature,
  HttpCapabilities,
  ReadyApp,
} from '@zeltjs/core';

import { CloudflareWorkersEnvAdaptor } from './cloudflare-workers-env.adaptor';

export type CloudflareWorkersOptions = {
  readonly warmup?: boolean;
};

export type CloudflareWorkersApp = {
  readonly get: <T extends object>(cls: new (...args: never[]) => T) => Promise<T>;
  readonly fetch: (request: Request, env: unknown, ctx: ExecutionContext) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

export const onCloudflareWorkers = async <const F extends readonly ConfiguredFeature[]>(
  app: AppRequiring<F, { readonly http: HttpCapabilities }>,
  options: CloudflareWorkersOptions = {},
): Promise<CloudflareWorkersApp> => {
  const readyApp = await app.ready({
    fallbackConfigs: [CloudflareWorkersEnvAdaptor],
    warmup: options.warmup ?? false,
  });

  const httpCaps = (
    readyApp as ReadyApp<readonly ConfiguredFeature[]> & { http: HttpCapabilities }
  ).http;

  const fetch = async (
    request: Request,
    _env: unknown,
    ctx: ExecutionContext,
  ): Promise<Response> => {
    const response = httpCaps.fetch(request);
    ctx.waitUntil(response.then(() => {}));
    return response;
  };

  return { get: readyApp.get, fetch, shutdown: readyApp.shutdown };
};
