import { defineError } from '@zeltjs/core/internal-bridge/errors';

export type JwtConfigErrorReason = 'missing_secret';

const messages: Record<JwtConfigErrorReason, string> = {
  missing_secret: 'JWT_SECRET environment variable is required',
};

export const ZeltJwtConfigError = defineError(
  'ZeltJwtConfigError',
  (ctx: { reason: JwtConfigErrorReason }) => messages[ctx.reason],
);
