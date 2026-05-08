import { AsyncLocalStorage } from 'node:async_hooks';

import type { SessionData, StoredSession } from './session.types';

export interface SessionContext<T extends SessionData = SessionData> {
  sessionId: string;
  session: StoredSession<T>;
  isNew: boolean;
  isDestroyed: boolean;
  isDirty: boolean;
}

const sessionStorage = new AsyncLocalStorage<SessionContext>();

export const getSessionContext = <T extends SessionData = SessionData>():
  | SessionContext<T>
  | undefined => {
  return sessionStorage.getStore() as SessionContext<T> | undefined;
};

export const runWithSessionContext = <T extends SessionData, R>(
  context: SessionContext<T>,
  fn: () => R,
): R => {
  return sessionStorage.run(context as SessionContext, fn);
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
