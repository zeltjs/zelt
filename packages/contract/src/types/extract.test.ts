import { describe, expectTypeOf, it } from 'vitest';
import type { TypedResponse } from 'hono';
import * as v from 'valibot';

import type {
  ExtractPathParams,
  ExtractRequestBody,
  ExtractResponse,
  ExtractValidationErrors,
} from './extract';
import type { ValidatedMarker } from './validated-marker';

// Types declared at module level to avoid TypeScript deferred-evaluation issues
// inside contextually-typed callbacks (describe/it).
const _Body = v.object({ name: v.string() });
type Body = v.InferOutput<typeof _Body>;

type HandlerWithBody = (body?: ValidatedMarker<Body>) => Promise<unknown>;
type HandlerNoBody = (id?: string) => Promise<unknown>;
type HandlerTypedResponse = () => Promise<TypedResponse<{ ok: true }, 201, 'json'>>;
type HandlerRawReturn = () => Promise<{ id: string }>;

type BodyFromHandler = ExtractRequestBody<HandlerWithBody>;
type BodyFromHandlerNoBody = ExtractRequestBody<HandlerNoBody>;
type ResponseTyped = ExtractResponse<HandlerTypedResponse>;
type ResponseRaw = ExtractResponse<HandlerRawReturn>;
type ValidationErrors = ExtractValidationErrors<HandlerWithBody>;
type ValidationErrorsNone = ExtractValidationErrors<HandlerNoBody>;

describe('ExtractPathParams', () => {
  it('extracts single param', () => {
    expectTypeOf<ExtractPathParams<'/users/:id'>>().toEqualTypeOf<{ id: string }>();
  });

  it('extracts multiple params', () => {
    expectTypeOf<ExtractPathParams<'/users/:userId/posts/:postId'>>().toEqualTypeOf<{
      userId: string;
      postId: string;
    }>();
  });

  it('returns empty for static path', () => {
    expectTypeOf<ExtractPathParams<'/users'>>().toEqualTypeOf<Record<string, never>>();
  });
});

describe('ExtractRequestBody', () => {
  it('extracts body type from validated() default arg marker', () => {
    expectTypeOf<BodyFromHandler>().toEqualTypeOf<Body>();
  });

  it('returns never when no validated() arg present', () => {
    expectTypeOf<BodyFromHandlerNoBody>().toBeNever();
  });
});

describe('ExtractResponse', () => {
  it('extracts TypedResponse json', () => {
    expectTypeOf<ResponseTyped>().toEqualTypeOf<TypedResponse<{ ok: true }, 201, 'json'>>();
  });

  it('treats raw return as 200 json', () => {
    expectTypeOf<ResponseRaw>().toEqualTypeOf<TypedResponse<{ id: string }, 200, 'json'>>();
  });
});

describe('ExtractValidationErrors', () => {
  it('returns 400 ValidationErrorBody when validated() arg present', () => {
    expectTypeOf<ValidationErrors>().not.toBeNever();
  });

  it('returns never when no validated() arg', () => {
    expectTypeOf<ValidationErrorsNone>().toBeNever();
  });
});
