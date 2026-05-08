import { getSessionContext, markSessionDestroyed, markSessionDirty } from './session.context.lib';
import type { SessionData } from './session.types';

export const getSession = <T extends SessionData = SessionData>(): T | undefined => {
  const ctx = getSessionContext<T>();
  if (!ctx || ctx.isDestroyed) {
    return undefined;
  }
  return ctx.session.data as T;
};

export const setSession = <T extends SessionData = SessionData>(data: T): void => {
  const ctx = getSessionContext<T>();
  if (ctx) {
    ctx.session.data = data;
    markSessionDirty();
  }
};

export const updateSession = <T extends SessionData = SessionData>(
  updater: (current: T) => T,
): void => {
  const ctx = getSessionContext<T>();
  if (ctx) {
    ctx.session.data = updater(ctx.session.data as T);
    markSessionDirty();
  }
};

export const destroySession = (): void => {
  markSessionDestroyed();
};

export const isNewSession = (): boolean => {
  const ctx = getSessionContext();
  return ctx?.isNew ?? false;
};

export const getSessionId = (): string | undefined => {
  const ctx = getSessionContext();
  return ctx?.sessionId;
};
