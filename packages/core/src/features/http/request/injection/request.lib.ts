import type { StandardSchemaV1 } from '@standard-schema/spec';
import { getCookie } from 'hono/cookie';

import { requestContext } from '../index';
import {
  AsyncValidationUnsupportedException,
  ValidationFailedException,
} from '../validated.exceptions';
import { body, getBody } from './body.lib';
import { pathParam } from './path-param.lib';
import { resolveClientIp } from './resolve-client-ip.lib';

declare const __zeltRequestBodyBrand: unique symbol;
declare const __zeltRequestBodyType: unique symbol;

type RequestAccessorBase<TBody> = {
  body(): Promise<TBody>;
  pathParam(name: string): string;
  queryParam(name: string): string | undefined;
  queryParams(name: string): string[];
  header(name: string): string | undefined;
  cookie(name: string): string | undefined;
  ip(): string | undefined;
  url(): string;
  path(): string;
  method(): string;
};

export type RequestAccessor<TBody = unknown> = RequestAccessorBase<TBody> & {
  [__zeltRequestBodyBrand]: true;
  readonly [__zeltRequestBodyType]: TBody;
};

export type ExtractRequestBody<H> =
  NonNullable<H> extends Record<typeof __zeltRequestBodyType, infer T> ? T : never;

export type HasRequestBody<H> =
  NonNullable<H> extends Record<typeof __zeltRequestBodyBrand, true> ? true : false;

type ValidationTarget = 'json' | 'form' | 'text';

const isThenable = (value: unknown): boolean => {
  if (value === null) return false;
  const valueType = typeof value;
  if (valueType !== 'object' && valueType !== 'function') return false;
  return typeof Reflect.get(Object(value), 'then') === 'function';
};

/** @throws {AsyncValidationUnsupportedException | ValidationFailedException} */
const validateBody = <Schema extends StandardSchemaV1>(
  raw: unknown,
  schema: Schema,
): StandardSchemaV1.InferOutput<Schema> => {
  const result = schema['~standard'].validate(raw);
  if (result instanceof Promise || isThenable(result)) {
    throw new AsyncValidationUnsupportedException({});
  }
  if (result.issues) {
    throw new ValidationFailedException({ issues: result.issues });
  }
  return result.value;
};

/** @throws {ZeltContextNotAvailableError | ZeltRouteConfigurationError | AsyncValidationUnsupportedException | ValidationFailedException} */
export function request(): RequestAccessor<unknown>;
/** @throws {ZeltContextNotAvailableError | ZeltRouteConfigurationError | AsyncValidationUnsupportedException | ValidationFailedException} */
export function request<Schema extends StandardSchemaV1>(
  schema: Schema,
  opts?: { target?: ValidationTarget },
): RequestAccessor<StandardSchemaV1.InferOutput<Schema>>;
/** @throws {ZeltContextNotAvailableError | ZeltRouteConfigurationError | AsyncValidationUnsupportedException | ValidationFailedException} */
export function request<Schema extends StandardSchemaV1>(
  schema?: Schema,
  opts?: { target?: ValidationTarget },
): RequestAccessorBase<unknown> {
  const ctx = requestContext();
  const target: ValidationTarget = opts?.target ?? 'json';

  const accessor: RequestAccessorBase<unknown> = {
    async body() {
      const parsed = getBody();
      if (parsed.type === 'none') return undefined;
      const raw = target === 'form' ? body('form') : target === 'text' ? body('text') : body();
      if (!schema) return raw;
      return validateBody(raw, schema);
    },
    pathParam: (name: string) => pathParam(name),
    queryParam: (name: string) => ctx.req.query(name),
    queryParams: (name: string) => ctx.req.queries(name) ?? [],
    header: (name: string) => ctx.req.header(name),
    cookie: (name: string) => getCookie(ctx, name),
    ip: () => resolveClientIp(ctx),
    url: () => ctx.req.url,
    path: () => ctx.req.path,
    method: () => ctx.req.method,
  };
  return accessor;
}
