import type {
  ConfigClass,
  ConfiguredFeature,
  CreateRuntimeOptions,
  HttpCapabilities,
  RuntimeApp,
} from '@zeltjs/core';
import { runWithCloudflareRuntimeContext } from './cloudflare-runtime-context.lib';
import { CloudflareWorkersEnvAdaptor } from './cloudflare-workers-env.adaptor';
import { CloudflareWorkersWaitUntilAdaptor } from './cloudflare-workers-wait-until.adaptor';

export type CloudflareWorkersOptions = {
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
};

type HttpRuntimeApp = RuntimeApp<readonly ConfiguredFeature[]> & {
  readonly http: HttpCapabilities;
};

type HttpApp = {
  readonly createRuntime: (options?: CreateRuntimeOptions) => Promise<HttpRuntimeApp>;
};

export type CloudflareWorkersApp = {
  readonly get: HttpRuntimeApp['get'];
  readonly fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

export const onCloudflareWorkers = async (
  app: HttpApp,
  options: CloudflareWorkersOptions = {},
): Promise<CloudflareWorkersApp> => {
  const readyApp = await app.createRuntime({
    ...(options.configs === undefined ? {} : { configs: options.configs }),
    fallbackConfigs: [CloudflareWorkersEnvAdaptor, CloudflareWorkersWaitUntilAdaptor],
    warmup: options.warmup ?? false,
  });

  const fetch = async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
    const response = runWithCloudflareRuntimeContext({ env, ctx }, () =>
      readyApp.http.fetch(request),
    );
    ctx.waitUntil(response.then(() => {}));
    return response;
  };

  return { get: readyApp.get, fetch, shutdown: readyApp.shutdown };
};
