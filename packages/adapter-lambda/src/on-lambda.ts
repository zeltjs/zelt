import type {
  ConfigClass,
  ConfiguredFeature,
  ContextMode,
  FeatureApp,
  RuntimeApp,
  ZeltPrebuilt,
} from '@zeltjs/core';
import { enableAsyncContext } from '@zeltjs/core/async-context';

import { LambdaEnvAdaptor } from './lambda-env.adaptor';

export type LambdaAppOptions = {
  readonly contextMode?: ContextMode;
  readonly configs?: readonly ConfigClass<object>[];
  readonly warmup?: boolean;
  readonly prebuilt?: ZeltPrebuilt;
};

export type LambdaApp<F extends readonly ConfiguredFeature[] = readonly ConfiguredFeature[]> =
  RuntimeApp<F>;

/** @throws {TypeError} */
export const onLambda = async <const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: LambdaAppOptions = {},
): Promise<LambdaApp<F>> => {
  enableAsyncContext();
  return app.createRuntime({
    ...(options.contextMode === undefined ? {} : { contextMode: options.contextMode }),
    ...(options.configs === undefined ? {} : { configs: options.configs }),
    ...(options.prebuilt === undefined ? {} : { prebuilt: options.prebuilt }),
    fallbackConfigs: [LambdaEnvAdaptor],
    warmup: options.warmup ?? false,
  });
};
