import { getSessionContext, markSessionDestroyed, markSessionDirty } from './session.context.lib';
import type { SessionSchema } from './session.types';

export const getSession = (): SessionSchema | undefined => {
  const ctx = getSessionContext();
  if (!ctx || ctx.isDestroyed) {
    return undefined;
  }
  return ctx.session.data;
};

export const setSession = (data: SessionSchema): void => {
  const ctx = getSessionContext();
  if (ctx) {
    ctx.session.data = data;
    markSessionDirty();
  }
};

export const updateSession = (updater: (current: SessionSchema) => SessionSchema): void => {
  const ctx = getSessionContext();
  if (ctx) {
    ctx.session.data = updater(ctx.session.data);
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
