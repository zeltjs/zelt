import { defineHttpException } from '../../kernel/errors';

export const BadRequestException = defineHttpException(
  'BadRequestException',
  400,
  (ctx: { reason: string }) => ctx.reason,
  {
    buildResponse: (_ctx, status, message) =>
      Response.json({ code: 'BAD_REQUEST', message }, { status }),
  },
);

export const UnsupportedMediaTypeException = defineHttpException(
  'UnsupportedMediaTypeException',
  415,
  (ctx: { expected: string; actual: string }) => `Expected ${ctx.expected} body, got ${ctx.actual}`,
  {
    buildResponse: (_ctx, status, message) =>
      Response.json({ code: 'UNSUPPORTED_MEDIA_TYPE', message }, { status }),
  },
);
