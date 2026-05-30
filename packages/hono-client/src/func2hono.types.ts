import type { ExtractValidated, IsValidated, ValidationErrorBody } from '@zeltjs/core';
import type { Hono } from 'hono';
import type { BlankEnv, Schema, TypedResponse } from 'hono/types';
import type { StatusCode } from 'hono/utils/http-status';

// === Extract types ===

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
  [T] extends [TypedResponse<infer _D, infer _S extends StatusCode, infer _F extends string>]
    ? T
    : [T] extends [Response]
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

// === Route type ===

export type Route<M extends string, P extends string, H extends (...args: never[]) => unknown> = {
  readonly method: M;
  readonly path: P;
  readonly params: ExtractPathParams<P>;
  readonly body: ExtractRequestBody<H>;
  readonly response: ExtractResponse<H> | ExtractValidationErrors<H>;
};

// === BuildAppType ===

type MethodKey<M extends string> = M extends 'GET'
  ? '$get'
  : M extends 'POST'
    ? '$post'
    : M extends 'PUT'
      ? '$put'
      : M extends 'PATCH'
        ? '$patch'
        : M extends 'DELETE'
          ? '$delete'
          : never;

type ResponseToEndpointOutput<R> =
  R extends TypedResponse<infer T, infer S extends StatusCode, infer F extends string>
    ? { output: T; outputFormat: F; status: S }
    : { output: R; outputFormat: 'json'; status: 200 };

type RouteResponseEndpoints<R> = R extends unknown ? ResponseToEndpointOutput<R> : never;

type IsEmptyRecord<P> = P extends Record<string, never> ? true : false;
type ParamInput<P> = IsEmptyRecord<P> extends true ? Record<never, never> : { param: P };
type BodyInput<B> = [B] extends [never] ? Record<never, never> : { json: B };
type RouteInput<P, B> = ParamInput<P> & BodyInput<B>;

type RouteMethodEntry<
  R extends { method: string; params: unknown; body: unknown; response: unknown },
> = {
  [K in MethodKey<R['method'] & string>]: {
    input: RouteInput<R['params'], R['body']>;
  } & RouteResponseEndpoints<R['response']>;
};

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

type RouteToSchema<R> = R extends {
  method: string;
  path: infer P extends string;
  params: unknown;
  body: unknown;
  response: unknown;
}
  ? { [K in P]: RouteMethodEntry<R & { method: string }> }
  : never;

type BuildSchema<Routes extends readonly unknown[]> = UnionToIntersection<
  RouteToSchema<Routes[number]>
>;

export type BuildAppType<
  Routes extends readonly { readonly method: string; readonly path: string }[],
> = Hono<BlankEnv, BuildSchema<Routes> extends Schema ? BuildSchema<Routes> : never, '/'>;
