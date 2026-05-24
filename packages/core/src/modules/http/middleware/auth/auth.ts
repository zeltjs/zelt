import { getInternal, setInternal } from '../../../../kernel/internal/context-key';
import { AUTH_CONTEXT } from '../../internal/context-keys';

/** @throws {ZeltContextNotAvailableError} */
export const setUser = <U>(user: U, roles: readonly string[] = []): void => {
  setInternal(AUTH_CONTEXT, { user, roles });
};

const castUser = <U>(value: unknown): U | undefined => value as U | undefined;

/**
 * @throws {ZeltContextNotAvailableError}
 */
export const currentUser = <U = unknown>(): U | undefined => {
  const ctx = getInternal(AUTH_CONTEXT);
  return castUser<U>(ctx?.user);
};

/**
 * @throws {ZeltContextNotAvailableError}
 */
export const currentRoles = (): readonly string[] => {
  const ctx = getInternal(AUTH_CONTEXT);
  return ctx?.roles ?? [];
};
