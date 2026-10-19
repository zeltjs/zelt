import type { FeatureName, HttpFetchTarget, ServiceResolver } from '@zeltjs/core';
import { Feature } from '@zeltjs/core';
import { ElectronIpcService } from './electron-ipc.service';
import type { ElectronIpcHandle, ElectronIpcListenOptions } from './electron-ipc.types';

export type ElectronIpcCapabilities = {
  readonly listen: (
    http: HttpFetchTarget,
    options?: ElectronIpcListenOptions,
  ) => Promise<ElectronIpcHandle>;
};

export class ElectronIpcFeature<TName extends string = 'electronIpc'> extends Feature<
  TName,
  ElectronIpcCapabilities
> {
  static readonly defaultKey = 'electronIpc';

  constructor(readonly key: TName) {
    super();
  }

  readonly featureClasses = () => [];
  readonly blueprint = () => ({});

  readonly realize = async (resolver: ServiceResolver): Promise<ElectronIpcCapabilities> => {
    const service = await resolver.get(ElectronIpcService);
    return {
      listen: async (http, options = {}) =>
        service.listen(http, options, resolver.registerShutdown),
    };
  };
}

export function electronIpc(): ElectronIpcFeature<'electronIpc'>;
export function electronIpc<const TName extends string>(options: {
  readonly name: TName & FeatureName<TName>;
}): ElectronIpcFeature<TName>;
export function electronIpc(options?: { readonly name: string }): ElectronIpcFeature<string> {
  return new ElectronIpcFeature(options?.name ?? 'electronIpc');
}
