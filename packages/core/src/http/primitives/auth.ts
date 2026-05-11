import { getContext, setContext, type RequestContextSchema } from './get-context';

export const setUser = <U extends RequestContextSchema['user']>(
  user: U,
  roles: RequestContextSchema['authRoles'] = [],
): void => {
  setContext('user', user);
  setContext('authRoles', roles);
};

export const currentUser = (): RequestContextSchema['user'] | undefined => {
  return getContext('user');
};

export const currentRoles = (): RequestContextSchema['authRoles'] => {
  return getContext('authRoles') ?? [];
};
