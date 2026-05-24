import type { RequestContextSchema } from './get-context';
import { getContext, setContext } from './get-context';

/** @throws {ZeltContextNotAvailableError} */
export const setUser = <U extends RequestContextSchema['user']>(
  user: U,
  roles: RequestContextSchema['authRoles'] = [],
): void => {
  setContext('user', user);
  setContext('authRoles', roles);
};

/**
 * @throws {ZeltContextNotAvailableError}
 * @throws {ZeltLifecycleStateError}
 */
export const currentUser = (): RequestContextSchema['user'] | undefined => {
  return getContext('user');
};

/**
 * @throws {ZeltContextNotAvailableError}
 * @throws {ZeltLifecycleStateError}
 */
export const currentRoles = (): RequestContextSchema['authRoles'] => {
  return getContext('authRoles') ?? [];
};
