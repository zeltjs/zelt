import { createContextStorage, ZeltContextNotAvailableError } from '@zeltjs/core';

export type CloudflareRuntimeContext = {
  readonly env: Env;
  readonly ctx: ExecutionContext;
};

const storage = createContextStorage<CloudflareRuntimeContext>('zelt:cloudflare-runtime');

/** @throws {ZeltContextNotAvailableError} */
export const getCloudflareRuntimeContext = (): CloudflareRuntimeContext => {
  const context = storage.get();
  if (!context) {
    throw new ZeltContextNotAvailableError({
      primitive: 'CloudflareBindings.get',
      requiredContext: 'entry',
    });
  }
  return context;
};

export const runWithCloudflareRuntimeContext = <T>(
  context: CloudflareRuntimeContext,
  fn: () => T,
): T => storage.run(context, fn);

export const tryGetCloudflareRuntimeContext = (): CloudflareRuntimeContext | undefined =>
  storage.get();

declare global {
  interface Env {}
}
