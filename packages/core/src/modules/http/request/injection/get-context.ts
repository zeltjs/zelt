import { requestContext } from '../request-context';

export interface RequestContextSchema {
  user: unknown;
  authRoles: string[];
}

/**
 * @throws {ZeltContextNotAvailableError}
 * @throws {ZeltLifecycleStateError}
 */
export const getContext = <K extends keyof RequestContextSchema>(
  key: K,
): RequestContextSchema[K] | undefined => {
  const value: RequestContextSchema[K] | undefined = requestContext().get(key);
  return value;
};

/** @throws {ZeltContextNotAvailableError} */
export const setContext = <K extends keyof RequestContextSchema>(
  key: K,
  value: RequestContextSchema[K],
): void => {
  requestContext().set(key, value);
};
