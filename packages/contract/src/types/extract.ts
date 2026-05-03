import type { TypedResponse } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import type { ExtractValidated, IsValidated, ValidationErrorBody } from '@koya/core';

// '/users/:id/posts/:postId' → { id: string; postId: string }
export type ExtractPathParams<P extends string> = string extends P
  ? Record<string, string>
  : P extends `${infer _Head}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractPathParams<`/${Rest}`>]: string }
    : P extends `${infer _Head}:${infer Param}`
      ? { [K in Param]: string }
      : Record<string, never>;

// Extracts the validated body type T from the FIRST parameter of a handler.
// koya handlers accept validated() as their first (and typically only) body arg.
// Uses Parameters<H>[0] (direct index) instead of `infer` from a spread pattern:
// TypeScript infers a "deferred" constrained type from tuple spread that prevents
// ExtractValidated from resolving correctly, while direct index access resolves fully.
export type ExtractRequestBody<H extends (...args: never[]) => unknown> = ExtractValidated<
  Parameters<H>[0]
>;

// handler 戻り値の Awaited を取り、TypedResponse ならそのまま、素データなら 200/json で wrap
type WrapRaw<T> =
  T extends TypedResponse<infer _D, infer _S extends StatusCode, infer _F extends string>
    ? T
    : T extends Response
      ? never // Response は contract 上 omit (spec §4.3)
      : TypedResponse<T, 200, 'json'>;

export type ExtractResponse<H extends (...args: never[]) => unknown> = WrapRaw<
  Awaited<ReturnType<H>>
>;

// Returns TypedResponse<ValidationErrorBody, 400> if the first handler arg is ValidatedMarker<T>,
// never otherwise. Uses Parameters<H>[0] directly (same reason as ExtractRequestBody).
export type ExtractValidationErrors<H extends (...args: never[]) => unknown> =
  IsValidated<Parameters<H>[0]> extends true
    ? TypedResponse<ValidationErrorBody, 400, 'json'>
    : never;
