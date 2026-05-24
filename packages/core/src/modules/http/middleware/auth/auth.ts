import type { RequestContextSchema } from '../../request/injection/get-context';

import {
  createContextKey,
  getInternal,
  setInternal,
} from '../../../../kernel/internal/context-key';

type AuthContextValue = Pick<RequestContextSchema, 'user' | 'authRoles'>;

const AUTH_CONTEXT = createContextKey<AuthContextValue>('zelt:auth');

/** @throws {ZeltContextNotAvailableError} */
export const setUser = <U extends RequestContextSchema['user']>(
  user: U,
  roles: RequestContextSchema['authRoles'] = [],
): void => {
  setInternal(AUTH_CONTEXT, { user, authRoles: roles });
};

/**
 * @throws {ZeltContextNotAvailableError}
 */
export const currentUser = (): RequestContextSchema['user'] | undefined => {
  const ctx = getInternal(AUTH_CONTEXT);
  return ctx?.user;
};

/**
 * @throws {ZeltContextNotAvailableError}
 */
export const currentRoles = (): RequestContextSchema['authRoles'] => {
  const ctx = getInternal(AUTH_CONTEXT);
  return ctx?.authRoles ?? [];
};
