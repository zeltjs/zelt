import { getHttpContext } from '../../internal/context-keys';

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
  const { honoContext } = getHttpContext();
  const value: RequestContextSchema[K] | undefined = honoContext.get(key);
  return value;
};

/** @throws {ZeltContextNotAvailableError} */
export const setContext = <K extends keyof RequestContextSchema>(
  key: K,
  value: RequestContextSchema[K],
): void => {
  const { honoContext } = getHttpContext();
  honoContext.set(key, value);
};
