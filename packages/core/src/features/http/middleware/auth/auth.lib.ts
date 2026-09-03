import { createContextKey, getInternal, setInternal } from '../../../../kernel';

export type AuthUser = Record<string, unknown>;
export type AuthRoles = readonly string[];

type AuthContext = {
  user?: AuthUser;
  authRoles?: AuthRoles;
};

const AUTH_CONTEXT = createContextKey<AuthContext>('zelt:auth-context');

/** @throws {ZeltContextNotAvailableError} */
export const setUser = (user: AuthUser, roles: AuthRoles = []): void => {
  const store = getInternal(AUTH_CONTEXT);
  if (store) {
    store.user = user;
    store.authRoles = roles;
    return;
  }
  setInternal(AUTH_CONTEXT, { user, authRoles: roles });
};

/** @throws {ZeltContextNotAvailableError} */
export const currentUser = (): AuthUser | undefined => {
  return getInternal(AUTH_CONTEXT)?.user;
};

/** @throws {ZeltContextNotAvailableError} */
export const currentRoles = (): AuthRoles => {
  return getInternal(AUTH_CONTEXT)?.authRoles ?? [];
};
