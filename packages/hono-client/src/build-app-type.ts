import type { Hono } from 'hono';
import type { BlankEnv, Schema, TypedResponse } from 'hono/types';
import type { StatusCode } from 'hono/utils/http-status';

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

type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof A
    ? K extends keyof B
      ? A[K] & B[K]
      : A[K]
    : K extends keyof B
      ? B[K]
      : never;
};

type BuildSchema<Routes extends readonly unknown[]> = Routes extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends {
      method: string;
      path: infer P extends string;
      params: unknown;
      body: unknown;
      response: unknown;
    }
    ? Merge<{ [K in P]: RouteMethodEntry<Head & { method: string }> }, BuildSchema<Tail>>
    : BuildSchema<Tail>
  : // biome-ignore lint/complexity/noBannedTypes: {} is required here
    {};

export type BuildAppType<
  Routes extends readonly { readonly method: string; readonly path: string }[],
> = Hono<BlankEnv, BuildSchema<Routes> extends Schema ? BuildSchema<Routes> : never, '/'>;
