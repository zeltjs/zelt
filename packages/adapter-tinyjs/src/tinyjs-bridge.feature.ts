import type { FeatureName, ServiceResolver } from '@zeltjs/core';
import { Feature } from '@zeltjs/core';
import { TinyjsBridgeService } from './tinyjs-bridge.service';
import type { TinyjsBridgeCapabilities } from './tinyjs-bridge.types';

export class TinyjsBridgeFeature<TName extends string = 'tinyjsBridge'> extends Feature<
  TName,
  TinyjsBridgeCapabilities
> {
  static readonly defaultKey = 'tinyjsBridge';

  constructor(readonly key: TName) {
    super();
  }

  readonly featureClasses = () => [];
  readonly blueprint = () => ({});

  readonly realize = async (resolver: ServiceResolver): Promise<TinyjsBridgeCapabilities> => {
    const service = await resolver.get(TinyjsBridgeService);
    return { create: (http, options) => service.create(http, options) };
  };
}

export function tinyjsBridge(): TinyjsBridgeFeature<'tinyjsBridge'>;
export function tinyjsBridge<const TName extends string>(options: {
  readonly name: TName & FeatureName<TName>;
}): TinyjsBridgeFeature<TName>;
export function tinyjsBridge(options?: { readonly name: string }): TinyjsBridgeFeature<string> {
  return new TinyjsBridgeFeature(options?.name ?? 'tinyjsBridge');
}
