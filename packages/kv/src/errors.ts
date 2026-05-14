import { defineError } from '@zeltjs/core/internal-bridge/errors';

export const ZeltKVInvalidTtlError = defineError(
  'ZeltKVInvalidTtlError',
  (ctx: { ttlSec: number }) => `ttlSec must be > 0, got ${ctx.ttlSec}`,
);

export const isZeltKVInvalidTtlError = (
  err: unknown,
): err is InstanceType<typeof ZeltKVInvalidTtlError> => {
  return err instanceof ZeltKVInvalidTtlError;
};
