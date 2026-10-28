import type { HttpFetchTarget } from '@zeltjs/core';
import type { TinyjsFetchHandler } from './fetch-bridge.lib';
import type { TINYJS_FETCH_METHOD, TinyjsNativeApp } from './shared/bridge.types';

export type TinyjsBridgeTargets = HttpFetchTarget | Map<string, HttpFetchTarget>;

export type TinyjsBridgeOptions = {
  readonly origin?: string;
};

export type TinyjsBridge<TNative extends TinyjsNativeApp = TinyjsNativeApp> = {
  readonly api: { readonly [TINYJS_FETCH_METHOD]: TinyjsFetchHandler };
  readonly init: (app: TNative) => void;
};

export type TinyjsBridgeCapabilities<TNative extends TinyjsNativeApp = TinyjsNativeApp> = {
  readonly create: (
    http: TinyjsBridgeTargets,
    options?: TinyjsBridgeOptions,
  ) => TinyjsBridge<TNative>;
};
