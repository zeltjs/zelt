import { NodeHttpServerAdaptor } from '@zeltjs/adapter-node';
import type {
  ConfigClass,
  ConfiguredFeature,
  ContextMode,
  FeatureApp,
  RuntimeApp,
  ZeltPrebuilt,
} from '@zeltjs/core';
import { enableAsyncContext } from '@zeltjs/core/async-context';

import { ElectronEnvAdaptor } from './electron-env.adaptor';

export type { ServerHandle } from '@zeltjs/adapter-node';

export type ElectronAppOptions = {
  readonly contextMode?: ContextMode;
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
  readonly prebuilt?: ZeltPrebuilt;
};

export type OnElectronApp = RuntimeApp<readonly ConfiguredFeature[]>;

/** @throws {ZeltContextNotAvailableError | AggregateError | TypeError} */
export async function onElectron<const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: ElectronAppOptions = {},
): Promise<RuntimeApp<F>> {
  enableAsyncContext();
  return app.createRuntime({
    ...(options.contextMode === undefined ? {} : { contextMode: options.contextMode }),
    ...(options.configs === undefined ? {} : { configs: options.configs }),
    ...(options.prebuilt === undefined ? {} : { prebuilt: options.prebuilt }),
    fallbackConfigs: [ElectronEnvAdaptor, NodeHttpServerAdaptor],
    warmup: options.warmup ?? true,
  });
}
