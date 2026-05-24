import type { RequestContextSchema } from '../../request/injection/get-context';

import { getInternal, setInternal } from '../../../../kernel/internal/context-key';
import { AUTH_CONTEXT } from '../../internal/context-keys';

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
