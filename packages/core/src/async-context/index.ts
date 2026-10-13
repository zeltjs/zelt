import { AsyncLocalStorage } from 'node:async_hooks';
import type { ContextFrame } from '../kernel';
import { hasAsyncContextCarrier, installAsyncContextCarrier } from '../kernel';

/**
 * Enable async propagation before creating runtimes; existing sync scopes keep their mode.
 * @throws {TypeError}
 */
export const enableAsyncContext = (): void => {
  if (hasAsyncContextCarrier()) return;
  const storage = new AsyncLocalStorage<ContextFrame>();
  installAsyncContextCarrier({
    get: () => storage.getStore(),
    run: (frame, fn) => storage.run(frame, fn),
  });
};
