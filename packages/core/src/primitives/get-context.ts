import { getEntryContext } from '../internal/entry-context';

export interface RequestContextSchema {
  user: unknown;
  authRoles: string[];
}

export const getContext = <K extends keyof RequestContextSchema>(
  key: K,
): RequestContextSchema[K] | undefined => {
  const ctx = getEntryContext();
  return ctx.honoContext.get(key) as RequestContextSchema[K] | undefined;
};

export const setContext = <K extends keyof RequestContextSchema>(
  key: K,
  value: RequestContextSchema[K],
): void => {
  const ctx = getEntryContext();
  ctx.honoContext.set(key, value);
};
