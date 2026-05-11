import { getEntryContext } from '../internal/entry-context';

export interface RequestContextSchema {
  user: unknown;
  authRoles: string[];
}

export const getContext = <K extends keyof RequestContextSchema>(
  key: K,
): RequestContextSchema[K] | undefined => {
  const ctx = getEntryContext();
  const value: RequestContextSchema[K] | undefined = ctx.honoContext.get(key);
  return value;
};

export const setContext = <K extends keyof RequestContextSchema>(
  key: K,
  value: RequestContextSchema[K],
): void => {
  const ctx = getEntryContext();
  ctx.honoContext.set(key, value);
};
