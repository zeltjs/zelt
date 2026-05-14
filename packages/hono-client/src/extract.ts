import type { ExtractValidated, IsValidated, ValidationErrorBody } from '@zeltjs/core';
import type { TypedResponse } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';

export type ExtractPathParams<P extends string> = string extends P
  ? Record<string, string>
  : P extends `${infer _Head}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractPathParams<`/${Rest}`>]: string }
    : P extends `${infer _Head}:${infer Param}`
      ? { [K in Param]: string }
      : Record<string, never>;

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

type WrapRaw<T> =
  T extends TypedResponse<infer _D, infer _S extends StatusCode, infer _F extends string>
    ? T
    : T extends Response
      ? never
      : TypedResponse<T, 200, 'json'>;

export type ExtractResponse<H extends (...args: never[]) => unknown> = WrapRaw<
  Awaited<ReturnType<H>>
>;

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
