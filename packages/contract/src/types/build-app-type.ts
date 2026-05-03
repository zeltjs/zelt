import type { Hono } from 'hono';
import type { StatusCode } from 'hono/utils/http-status';
import type { BlankEnv, Schema, TypedResponse } from 'hono/types';

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

// TypedResponse<T, S, F> → { output: T; outputFormat: F; status: S }
// Raw value → wrap as 200/json
type ResponseToEndpointOutput<R> =
  R extends TypedResponse<infer T, infer S extends StatusCode, infer F extends string>
    ? { output: T; outputFormat: F; status: S }
    : { output: R; outputFormat: 'json'; status: 200 };

// Route['response'] may be a union; distribute over it
type RouteResponseEndpoints<R> = R extends unknown ? ResponseToEndpointOutput<R> : never;

// Build a single method endpoint entry for a Route-shaped object
type RouteMethodEntry<
  R extends { method: string; params: unknown; body: unknown; response: unknown },
> = {
  [K in MethodKey<R['method'] & string>]: {
    input: { param: R['params']; json: R['body'] };
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

// BuildSchema folds a tuple of Route-shaped objects into the hono Schema shape.
// We use the structural { method, path, params, body, response } shape rather than
// the full Route<M, P, H> to avoid strict compatibility checks on computed fields.
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
  : // Empty object base case: avoids Record<string, never> which would intersect
    // all route entries with never when Merge distributes over string keys.
    // biome-ignore lint/complexity/noBannedTypes: {} is required here — Record<string, never> would cause all Merge results to be never
    {};

// hc<T> requires T extends Hono<any, any, any>.
// We produce Hono<BlankEnv, S, '/'> so the schema S is visible to hc's Client type.
// Routes items are matched structurally in BuildSchema, so the constraint only
// checks method/path presence to avoid strict compatibility checks on computed fields.
export type BuildAppType<
  Routes extends readonly { readonly method: string; readonly path: string }[],
> = Hono<BlankEnv, BuildSchema<Routes> extends Schema ? BuildSchema<Routes> : never, '/'>;
