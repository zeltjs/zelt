import type { HttpApp, ReadyOptions, ReadyResult } from '@zeltjs/core';

import { ElectronEnvAdaptor } from './electron-env.adaptor';

export type ElectronAppOptions = {
  readonly warmup?: boolean;
};

export type ElectronApp = ReadyResult & {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly shutdown: () => Promise<void>;
};

export const onElectron = async (
  app: HttpApp,
  options: ElectronAppOptions = {},
): Promise<ElectronApp> => {
  app.addFallbackConfig(ElectronEnvAdaptor);

  const readyOptions: ReadyOptions = { warmup: options.warmup ?? true };
  const resolver = await app.ready(readyOptions);

  return {
    ...resolver,
    fetch: app.fetch,
    shutdown: app.shutdown,
  };
};
