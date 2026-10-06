import type { Context, Env, Input } from 'hono';
import { canMutateGeneratedResponse } from './response-ownership.lib';

type ResponseHeader = readonly [name: string, value: string];
type ResponseContext = Context<Env, string, Input>;

const setResponseHeader = (ctx: ResponseContext, name: string, value: string | undefined): void => {
  const response = ctx.res;
  if (!canMutateGeneratedResponse(ctx, response)) {
    ctx.header(name, value);
    return;
  }
  if (value === undefined) response.headers.delete(name);
  else response.headers.set(name, value);
};

// The first change makes external or observed responses writable through Hono;
// subsequent changes use those isolated headers without copying again.
/** @throws {TypeError} */
export const applyResponseHeaders = (
  ctx: ResponseContext,
  additions: readonly ResponseHeader[],
  removals: readonly string[],
): void => {
  const first = additions[0];
  const firstRemoval = removals[0];
  if (first) setResponseHeader(ctx, first[0], first[1]);
  else if (firstRemoval !== undefined) setResponseHeader(ctx, firstRemoval, undefined);
  else return;

  const headers = ctx.res.headers;
  for (let index = 1; index < additions.length; index++) {
    const addition = additions[index];
    if (!addition) throw new TypeError('Invalid response header definition.');
    headers.set(addition[0], addition[1]);
  }
  for (const name of removals) headers.delete(name);
};
