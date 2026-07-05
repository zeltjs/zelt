import { AsyncLocalStorage } from 'node:async_hooks';
import { ZeltContextNotAvailableError } from '@zeltjs/core';

export type CloudflareRuntimeContext = {
  readonly env: Env;
  readonly ctx: ExecutionContext;
};

const storage = new AsyncLocalStorage<CloudflareRuntimeContext>();

/** @throws {ZeltContextNotAvailableError} */
export const getCloudflareRuntimeContext = (): CloudflareRuntimeContext => {
  const context = storage.getStore();
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
  storage.getStore();

declare global {
  interface Env {}
}
