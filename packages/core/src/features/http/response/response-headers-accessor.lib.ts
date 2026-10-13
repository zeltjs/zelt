import { deleteCookie, setCookie } from 'hono/cookie';

import { getHonoContext } from '../request';
import type { CookieOptions, HeaderOptions } from './http-reply.types';
import { applyResponseHeaders } from './response-headers.lib';

export type ResponseHeadersAccessor = {
  set(name: string, value: string, options?: HeaderOptions): void;
  remove(name: string): void;
  setCookie(name: string, value: string, options?: CookieOptions): void;
  deleteCookie(name: string, options?: CookieOptions): void;
};

/** @throws {ZeltContextNotAvailableError | TypeError} */
export const responseHeaders = (): ResponseHeadersAccessor => {
  const ctx = getHonoContext();
  return {
    set: (name, value, options) => {
      if (!ctx.finalized || options?.type === 'append')
        ctx.header(name, value, { append: options?.type === 'append' });
      else applyResponseHeaders(ctx, [[name, value]], []);
    },
    remove: (name) => {
      if (!ctx.finalized) ctx.header(name, undefined);
      else applyResponseHeaders(ctx, [], [name]);
    },
    setCookie: (name, value, options) => setCookie(ctx, name, value, options),
    deleteCookie: (name, options) => deleteCookie(ctx, name, options),
  };
};
