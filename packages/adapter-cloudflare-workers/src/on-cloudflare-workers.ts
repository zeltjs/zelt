import type {
  ConfigClass,
  ConfiguredFeature,
  ContextMode,
  FeatureApp,
  RuntimeApp,
  ZeltPrebuilt,
} from '@zeltjs/core';
import { CloudflareWorkersEnvAdaptor } from './cloudflare-workers-env.adaptor';
import { CloudflareWorkersWaitUntilAdaptor } from './cloudflare-workers-wait-until.adaptor';

export type CloudflareWorkersOptions = {
  readonly contextMode?: ContextMode;
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
  readonly prebuilt?: ZeltPrebuilt;
};

export type CloudflareWorkersApp<
  F extends readonly ConfiguredFeature[] = readonly ConfiguredFeature[],
> = RuntimeApp<F>;

export const onCloudflareWorkers = async <const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: CloudflareWorkersOptions = {},
): Promise<CloudflareWorkersApp<F>> => {
  return app.createRuntime({
    ...(options.contextMode === undefined ? {} : { contextMode: options.contextMode }),
    ...(options.configs === undefined ? {} : { configs: options.configs }),
    ...(options.prebuilt === undefined ? {} : { prebuilt: options.prebuilt }),
    fallbackConfigs: [CloudflareWorkersEnvAdaptor, CloudflareWorkersWaitUntilAdaptor],
    warmup: options.warmup ?? false,
  });
};
