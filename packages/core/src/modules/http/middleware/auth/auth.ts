import type { RequestContextSchema } from '../../request/injection/get-context';
import { getContext, setContext } from '../../request/injection/get-context';

/** @throws {ZeltContextNotAvailableError} */
export const setUser = <U extends RequestContextSchema['user']>(
  user: U,
  roles: RequestContextSchema['authRoles'] = [],
): void => {
  setContext('user', user);
  setContext('authRoles', roles);
};

/** @throws {ZeltContextNotAvailableError} */
export const currentUser = (): RequestContextSchema['user'] | undefined => {
  return getContext('user');
};

/** @throws {ZeltContextNotAvailableError} */
export const currentRoles = (): RequestContextSchema['authRoles'] => {
  return getContext('authRoles') ?? [];
};
