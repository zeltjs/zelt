import type { TxikiApp, TxikiAppOptions } from '@zeltjs/adapter-txiki';
import { onTxiki } from '@zeltjs/adapter-txiki';
import type { ConfiguredFeature, FeatureApp } from '@zeltjs/core';
import { HttpFeature, ZeltLifecycleStateError } from '@zeltjs/core';
import type { TinyjsFetchHandler } from './fetch-bridge.lib';
import { createFetchBridge } from './fetch-bridge.lib';
import { bridgeUrl } from './shared';
import type { TinyjsNativeApp } from './shared/bridge.types';
import { DEFAULT_TINYJS_ORIGIN, TINYJS_FETCH_METHOD } from './shared/bridge.types';
import { TinyjsAppAdaptor } from './tinyjs-app.adaptor';

type HttpFeatureKeys<F extends readonly ConfiguredFeature[]> = Extract<
  F[number],
  HttpFeature<string>
>['key'];

export type TinyjsAppOptions<F extends readonly ConfiguredFeature[]> = Omit<
  TxikiAppOptions,
  'signals'
> & {
  readonly origin?: string;
  readonly bridgeFeatures?: readonly HttpFeatureKeys<F>[];
};

export type TinyjsApp<F extends readonly ConfiguredFeature[]> = TxikiApp<F> & {
  readonly api: { readonly [TINYJS_FETCH_METHOD]: TinyjsFetchHandler };
  readonly init: (app: TinyjsNativeApp) => void;
};

/** @throws {TypeError} */
const validateFeatureNames = (features: readonly ConfiguredFeature[]): void => {
  for (const feature of features) {
    if (feature.key === 'api' || feature.key === 'init') {
      throw new TypeError(
        `tinyjs reserves the feature name "${feature.key}" for its native bridge`,
      );
    }
  }
};

/** @throws {TypeError | AggregateError | ZeltLifecycleStateError} */
export const onTinyjs = async <const F extends readonly ConfiguredFeature[]>(
  app: FeatureApp<F>,
  options: TinyjsAppOptions<F> = {},
): Promise<TinyjsApp<F>> => {
  validateFeatureNames(app.features);
  const origin = bridgeUrl('/', options.origin ?? DEFAULT_TINYJS_ORIGIN).origin;
  const runtime = await onTxiki(app, { ...options, signals: false });
  const entries = runtime.getFeatureEntries(HttpFeature);
  const selected = options.bridgeFeatures ?? entries.map((entry) => entry.key);
  const fetchers = new Map<string, (request: Request) => Promise<Response>>();
  for (const name of selected) {
    const entry = entries.find((candidate) => candidate.key === name);
    if (!entry) {
      await runtime.shutdown();
      throw new TypeError(`HTTP feature "${name}" is not configured`);
    }
    fetchers.set(name, entry.capabilities.fetch);
  }
  const adaptor = await runtime.get(TinyjsAppAdaptor);
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): Promise<void> =>
    (shutdownPromise ??= runtime.shutdown().finally(() => {
      shutdownPromise = undefined;
    }));
  const fetch = createFetchBridge(fetchers, origin);
  /** @throws {ZeltLifecycleStateError | TypeError} */
  const bridgeFetch: TinyjsFetchHandler = async (payload) => {
    if (shutdownPromise || adaptor.isDisposed)
      throw new ZeltLifecycleStateError({
        operation: 'call tinyjs bridge',
        currentState: 'disposed',
      });
    return fetch(payload);
  };
  let initialized = false;
  /** @throws {ZeltLifecycleStateError} */
  const init = (native: TinyjsNativeApp): void => {
    if (initialized || shutdownPromise || adaptor.isDisposed)
      throw new ZeltLifecycleStateError({
        operation: 'initialize tinyjs app',
        currentState: 'ready',
      });
    adaptor.attach(native);
    initialized = true;
    // tinyjs awaits app.done before tjs.exit(); extend it so shutdown finishes first.
    native.done = native.done.finally(shutdown);
  };
  return { ...runtime, shutdown, api: { [TINYJS_FETCH_METHOD]: bridgeFetch }, init };
};
