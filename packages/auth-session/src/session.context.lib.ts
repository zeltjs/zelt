import { AsyncLocalStorage } from 'node:async_hooks';

import type { SessionMetadata, SessionSchema } from './session.types';

export interface SessionContext {
  sessionId: string;
  session: {
    data: SessionSchema;
    meta: SessionMetadata;
  };
  isNew: boolean;
  isDestroyed: boolean;
  isDirty: boolean;
}

const sessionStorage = new AsyncLocalStorage<SessionContext>();

export const getSessionContext = (): SessionContext | undefined => {
  return sessionStorage.getStore();
};

export const runWithSessionContext = <R>(context: SessionContext, fn: () => R): R => {
  return sessionStorage.run(context, fn);
};

export const markSessionDirty = (): void => {
  const ctx = getSessionContext();
  if (ctx) {
    ctx.isDirty = true;
  }
};

export const markSessionDestroyed = (): void => {
  const ctx = getSessionContext();
  if (ctx) {
    ctx.isDestroyed = true;
    ctx.isDirty = true;
  }
};
