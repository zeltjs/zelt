import { defineError } from '@zeltjs/core/internal-bridge/errors';

export type SessionConfigErrorReason = 'store_not_overridden' | 'missing_secret';

const messages: Record<SessionConfigErrorReason, string> = {
  store_not_overridden: 'SessionConfig.store must be overridden',
  missing_secret: 'SESSION_SECRET environment variable is required',
};

export const ZeltSessionConfigError = defineError(
  'ZeltSessionConfigError',
  (ctx: { reason: SessionConfigErrorReason }) => messages[ctx.reason],
);
