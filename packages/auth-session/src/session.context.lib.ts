import { createContextStorage } from '@zeltjs/core';

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

const sessionStorage = createContextStorage<SessionContext>('zelt:auth-session');

export const getSessionContext = (): SessionContext | undefined => {
  return sessionStorage.get();
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
