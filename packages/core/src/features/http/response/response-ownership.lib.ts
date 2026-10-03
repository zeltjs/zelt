import type { RequestContext } from '../middleware/middleware.types';

const generatedResponses = new WeakMap<RequestContext, Response | false>();

export const trackGeneratedResponse = (ctx: RequestContext, response: Response): Response => {
  if (generatedResponses.get(ctx) !== false) generatedResponses.set(ctx, response);
  return response;
};

export const preserveResponseIsolation = (ctx: RequestContext): void => {
  generatedResponses.set(ctx, false);
};

export const canMutateGeneratedResponse = (ctx: RequestContext, response: Response): boolean =>
  generatedResponses.get(ctx) === response;
