import { createContextKey, getInternal, hasContext, setInternal } from '../../../kernel';

type AfterResponseCallback = () => void | Promise<void>;

type AfterResponseRegistry = {
  callbacks: AfterResponseCallback[] | undefined;
  flushed: boolean;
};

const AFTER_RESPONSE_REGISTRY = /* @__PURE__ */ createContextKey<AfterResponseRegistry>(
  'zelt:http-after-response',
);

/** @throws {ZeltContextNotAvailableError} */
export const initializeAfterResponseCallbacks = (): void => {
  setInternal(AFTER_RESPONSE_REGISTRY, { callbacks: undefined, flushed: false });
};

/** @throws {ZeltContextNotAvailableError} */
export const registerAfterResponseCallback = (callback: AfterResponseCallback): boolean => {
  if (!hasContext()) return false;

  const registry = getInternal(AFTER_RESPONSE_REGISTRY);
  if (!registry || registry.flushed) return false;

  registry.callbacks ??= [];
  registry.callbacks.push(callback);
  return true;
};

/** @throws {ZeltContextNotAvailableError} */
export const flushAfterResponseCallbacks = (onError?: (error: unknown) => void): Promise<void> => {
  if (!hasContext()) return Promise.resolve();

  const registry = getInternal(AFTER_RESPONSE_REGISTRY);
  if (!registry || registry.flushed) return Promise.resolve();

  registry.flushed = true;
  const callbacks = registry.callbacks;
  if (!callbacks) return Promise.resolve();
  registry.callbacks = undefined;

  const completions = callbacks.map(
    (callback) =>
      new Promise<void>((resolveDone) => {
        setTimeout(() => {
          void Promise.resolve()
            .then(callback)
            .catch((error: unknown) => {
              try {
                onError?.(error);
              } catch {
                // The original callback failure has already been reported.
              }
            })
            .finally(resolveDone);
        }, 0);
      }),
  );

  return Promise.all(completions).then(() => {});
};
