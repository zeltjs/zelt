import {
  createContextKey,
  getInternal,
  setInternal,
} from '../../../../kernel/internal/context-key';

export interface RequestContextSchema {
  user: unknown;
  authRoles: readonly string[];
}

const USER_CONTEXT = createContextKey<Partial<RequestContextSchema>>('zelt:user-context');

/** @throws {ZeltContextNotAvailableError} */
export const getContext = <K extends keyof RequestContextSchema>(
  key: K,
): RequestContextSchema[K] | undefined => {
  const store = getInternal(USER_CONTEXT);
  return store?.[key];
};

/** @throws {ZeltContextNotAvailableError} */
export const setContext = <K extends keyof RequestContextSchema>(
  key: K,
  value: RequestContextSchema[K],
): void => {
  let store = getInternal(USER_CONTEXT);
  if (!store) {
    store = {};
    setInternal(USER_CONTEXT, store);
  }
  store[key] = value;
};
