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

// Scans handler args in order and returns the inner T of the first ValidatedMarker<T> found.
// Uses function-type inference (H extends (a0: infer A0, ...) => unknown) instead of
// Parameters<H>[number] to avoid TypeScript deferred-evaluation of tuple index unions,
// which prevents ExtractValidated from resolving under tsc -b composite mode.
export type ExtractRequestBody<H extends (...args: never[]) => unknown> = H extends (
  a0: infer A0,
  ...r0: infer _R0
) => unknown
  ? ExtractValidated<A0> extends never
    ? H extends (b0: infer _B0, a1: infer A1, ...r1: infer _R1) => unknown
      ? ExtractValidated<A1> extends never
        ? H extends (c0: infer _C0, c1: infer _C1, a2: infer A2, ...r2: infer _R2) => unknown
          ? ExtractValidated<A2>
          : never
        : ExtractValidated<A1>
      : never
    : ExtractValidated<A0>
  : never;

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

// Returns TypedResponse<ValidationErrorBody, 400> if any handler arg is ValidatedMarker<T>.
// Uses the same function-type inference approach as ExtractRequestBody (see above).
export type ExtractValidationErrors<H extends (...args: never[]) => unknown> = (
  H extends (a0: infer A0, ...r0: infer _R0) => unknown
    ? IsValidated<A0> extends true
      ? true
      : H extends (b0: infer _B0, a1: infer A1, ...r1: infer _R1) => unknown
        ? IsValidated<A1> extends true
          ? true
          : H extends (c0: infer _C0, c1: infer _C1, a2: infer A2, ...r2: infer _R2) => unknown
            ? IsValidated<A2> extends true
              ? true
              : false
            : false
        : false
    : false
) extends true
  ? TypedResponse<ValidationErrorBody, 400, 'json'>
  : never;
