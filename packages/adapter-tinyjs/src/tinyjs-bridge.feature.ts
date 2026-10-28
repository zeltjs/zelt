import type { FeatureName, ServiceResolver } from '@zeltjs/core';
import { Feature } from '@zeltjs/core';
import type { TinyjsNativeApp } from './shared/bridge.types';
import { TinyjsAppAdaptor } from './tinyjs-app.adaptor';
import { TinyjsBridgeService } from './tinyjs-bridge.service';
import type { TinyjsBridgeCapabilities } from './tinyjs-bridge.types';

type TinyjsAdaptorClass<TNative extends TinyjsNativeApp> = new (
  ...args: never[]
) => TinyjsAppAdaptor<TNative>;

export class TinyjsBridgeFeature<
  TName extends string = 'tinyjsBridge',
  TNative extends TinyjsNativeApp = TinyjsNativeApp,
> extends Feature<TName, TinyjsBridgeCapabilities<TNative>> {
  static readonly defaultKey = 'tinyjsBridge';

  constructor(
    readonly key: TName,
    private readonly adaptor: TinyjsAdaptorClass<TNative>,
  ) {
    super();
  }

  readonly featureClasses = () => [];
  readonly blueprint = () => ({});

  readonly realize = async (
    resolver: ServiceResolver,
  ): Promise<TinyjsBridgeCapabilities<TNative>> => {
    const service = await resolver.get(TinyjsBridgeService);
    const adaptor = await resolver.get(this.adaptor);
    return { create: (http, options) => service.create(adaptor, http, options) };
  };
}

export function tinyjsBridge(): TinyjsBridgeFeature<'tinyjsBridge'>;
export function tinyjsBridge<TNative extends TinyjsNativeApp>(options: {
  readonly adaptor: TinyjsAdaptorClass<TNative>;
}): TinyjsBridgeFeature<'tinyjsBridge', TNative>;
export function tinyjsBridge<const TName extends string>(options: {
  readonly name: TName & FeatureName<TName>;
}): TinyjsBridgeFeature<TName>;
export function tinyjsBridge<const TName extends string, TNative extends TinyjsNativeApp>(options: {
  readonly name: TName & FeatureName<TName>;
  readonly adaptor: TinyjsAdaptorClass<TNative>;
}): TinyjsBridgeFeature<TName, TNative>;
export function tinyjsBridge(options?: {
  readonly name?: string;
  readonly adaptor?: TinyjsAdaptorClass<TinyjsNativeApp>;
}) {
  return new TinyjsBridgeFeature(
    options?.name ?? 'tinyjsBridge',
    options?.adaptor ?? TinyjsAppAdaptor,
  );
}
