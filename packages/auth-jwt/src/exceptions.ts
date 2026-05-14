import { defineHttpException } from '@zeltjs/core';

export type UnauthorizedReason = 'missing_token' | 'invalid_token' | 'expired';

const messages: Record<UnauthorizedReason, string> = {
  missing_token: 'Authorization token is required',
  invalid_token: 'Invalid authorization token',
  expired: 'Authorization token has expired',
};

export const UnauthorizedException = defineHttpException(
  'UnauthorizedException',
  401,
  (ctx: { reason: UnauthorizedReason }) => messages[ctx.reason],
  {
    buildResponse: (ctx, status, message) =>
      Response.json(
        { code: 'UNAUTHORIZED', reason: ctx.reason, message },
        { status, headers: { 'WWW-Authenticate': 'Bearer' } },
      ),
  },
);
