import { createContextKey, getInternal, hasContext, setInternal } from '../../../kernel';

type AfterResponseCallback = () => void | Promise<void>;

type AfterResponseRegistry = {
  readonly callbacks: AfterResponseCallback[];
  flushed: boolean;
};

const AFTER_RESPONSE_REGISTRY = createContextKey<AfterResponseRegistry>('zelt:http-after-response');

/** @throws {ZeltContextNotAvailableError} */
export const initializeAfterResponseCallbacks = (): void => {
  setInternal(AFTER_RESPONSE_REGISTRY, { callbacks: [], flushed: false });
};

/** @throws {ZeltContextNotAvailableError} */
export const registerAfterResponseCallback = (callback: AfterResponseCallback): boolean => {
  if (!hasContext()) return false;

  const registry = getInternal(AFTER_RESPONSE_REGISTRY);
  if (!registry || registry.flushed) return false;

  registry.callbacks.push(callback);
  return true;
};

/** @throws {ZeltContextNotAvailableError} */
export const flushAfterResponseCallbacks = (onError?: (error: unknown) => void): void => {
  if (!hasContext()) return;

  const registry = getInternal(AFTER_RESPONSE_REGISTRY);
  if (!registry || registry.flushed) return;

  registry.flushed = true;
  const callbacks = [...registry.callbacks];
  registry.callbacks.length = 0;

  for (const callback of callbacks) {
    setTimeout(() => {
      void Promise.resolve()
        .then(callback)
        .catch((error: unknown) => {
          try {
            onError?.(error);
          } catch {
            // The original callback failure has already been reported.
          }
        });
    }, 0);
  }
};
