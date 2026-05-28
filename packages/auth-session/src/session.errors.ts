import { defineError } from '@zeltjs/core/internal-bridge/errors';

export type SessionConfigErrorReason = 'missing_secret';

const messages: Record<SessionConfigErrorReason, string> = {
  missing_secret: 'SESSION_SECRET environment variable is required',
};

export const ZeltSessionConfigError = defineError(
  'ZeltSessionConfigError',
  (ctx: { reason: SessionConfigErrorReason }) => messages[ctx.reason],
);
