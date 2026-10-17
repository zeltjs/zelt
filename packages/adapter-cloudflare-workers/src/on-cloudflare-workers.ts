import type {
  ConfigClass,
  ConfiguredFeature,
  ContextMode,
  CreateRuntimeOptions,
  HttpCapabilities,
  RuntimeApp,
  ZeltPrebuilt,
} from '@zeltjs/core';
import { runWithCloudflareRuntimeContext } from './cloudflare-runtime-context.lib';
import { CloudflareWorkersEnvAdaptor } from './cloudflare-workers-env.adaptor';
import { CloudflareWorkersWaitUntilAdaptor } from './cloudflare-workers-wait-until.adaptor';

export type CloudflareWorkersOptions = {
  readonly contextMode?: ContextMode;
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
  readonly prebuilt?: ZeltPrebuilt;
};

type HttpRuntimeApp = RuntimeApp<readonly ConfiguredFeature[]> & {
  readonly http: HttpCapabilities;
};

type HttpApp<T extends HttpRuntimeApp> = {
  readonly createRuntime: (options?: CreateRuntimeOptions) => Promise<T>;
};

export type CloudflareWorkersApp<T extends HttpRuntimeApp = HttpRuntimeApp> = T & {
  readonly get: HttpRuntimeApp['get'];
  readonly fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

export const onCloudflareWorkers = async <T extends HttpRuntimeApp>(
  app: HttpApp<T>,
  options: CloudflareWorkersOptions = {},
): Promise<CloudflareWorkersApp<T>> => {
  const readyApp = await app.createRuntime({
    ...(options.contextMode === undefined ? {} : { contextMode: options.contextMode }),
    ...(options.configs === undefined ? {} : { configs: options.configs }),
    ...(options.prebuilt === undefined ? {} : { prebuilt: options.prebuilt }),
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

  return { ...readyApp, fetch };
};
