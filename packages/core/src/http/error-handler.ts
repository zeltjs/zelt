import { HTTPException } from 'hono/http-exception';
import * as v from 'valibot';

import type { KoyaErrorBody } from './error-schema';

// edge / serverless 環境でも `process.env.NODE_ENV` は build 時 inline / runtime polyfill が一般的。
// `process` が undefined の環境では development とみなさず、安全側 (= leak 隠蔽) に倒す。
const isDevelopment = (): boolean => {
  if (typeof process === 'undefined') return false;
  const env: { NODE_ENV?: string } = process.env;
  return env.NODE_ENV === 'development';
};

const internalErrorMessage = (error: unknown): string =>
  isDevelopment() && error instanceof Error ? error.message : 'internal server error';

export const toErrorResponse = (error: unknown): Response => {
  if (error instanceof v.ValiError) {
    return Response.json(
      { error: 'validation_failed', issues: error.issues } satisfies KoyaErrorBody,
      { status: 400 },
    );
  }
  if (error instanceof HTTPException) {
    // 利用者が constructor で res を渡してきた場合は pass-through (論点 2 = A、原則からの例外)。
    // koya は hono の HTTPException re-export を許容しているため、任意 Response を返す自由度を揃える。
    if (error.res) return error.res;
    return Response.json(
      { error: 'http_exception', message: error.message } satisfies KoyaErrorBody,
      { status: error.status },
    );
  }
  return Response.json(
    { error: 'internal_error', message: internalErrorMessage(error) } satisfies KoyaErrorBody,
    { status: 500 },
  );
};
