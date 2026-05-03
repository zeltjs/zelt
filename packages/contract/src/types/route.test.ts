import { describe, expectTypeOf, it } from 'vitest';
import type { TypedResponse } from 'hono';
import type { ValidationErrorBody } from '@koya/core';
import * as v from 'valibot';

import type { Route } from './route';
import type { ValidatedMarker } from './validated-marker';

// Types declared at module level to avoid TypeScript deferred-evaluation issues
// inside contextually-typed callbacks (describe/it).
const _Body = v.object({ name: v.string() });
type Body = v.InferOutput<typeof _Body>;

type RouteGetWithParam = Route<'GET', '/users/:id', () => Promise<{ id: string }>>;
type RoutePostWithBody = Route<
  'POST',
  '/users',
  (body?: ValidatedMarker<Body>) => Promise<{ ok: true }>
>;
type RoutePostWithBodyTypedResponse = Route<
  'POST',
  '/users',
  (body?: ValidatedMarker<Body>) => Promise<TypedResponse<{ ok: true }, 201, 'json'>>
>;

describe('Route', () => {
  it('shows path params for parametric path', () => {
    expectTypeOf<RouteGetWithParam['params']>().toEqualTypeOf<{ id: string }>();
  });

  it('lifts validated() body into Route.body', () => {
    expectTypeOf<RoutePostWithBody['body']>().toEqualTypeOf<Body>();
  });

  it('union of return + validation 400 in response', () => {
    expectTypeOf<RoutePostWithBodyTypedResponse['response']>().toMatchTypeOf<
      TypedResponse<{ ok: true }, 201, 'json'> | TypedResponse<ValidationErrorBody, 400, 'json'>
    >();
  });
});
