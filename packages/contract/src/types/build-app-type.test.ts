import { describe, expectTypeOf, it } from 'vitest';
import { hc } from 'hono/client';
import type { TypedResponse } from 'hono';
import * as v from 'valibot';

import type { BuildAppType } from './build-app-type';
import type { Route } from './route';
import type { ValidatedMarker } from './validated-marker';

// Types declared at module level to avoid TypeScript deferred-evaluation issues
// inside contextually-typed callbacks (describe/it).
const _Body = v.object({ name: v.string() });
type Body = v.InferOutput<typeof _Body>;

type AppType = BuildAppType<
  [
    Route<'GET', '/users/:id', (id?: string) => Promise<{ id: string; name: string }>>,
    Route<
      'POST',
      '/users',
      (body?: ValidatedMarker<Body>) => Promise<TypedResponse<{ id: string }, 201, 'json'>>
    >,
  ]
>;

const _client = hc<AppType>('http://x');
type GetReturn = Awaited<ReturnType<(typeof _client.users)[':id']['$get']>>;
type PostReturn = Awaited<ReturnType<(typeof _client.users)['$post']>>;
type PostStatus = PostReturn['status'];

describe('BuildAppType + hc<AppType>', () => {
  it('hc client narrows GET response', () => {
    expectTypeOf<GetReturn>().toBeObject();
  });

  it('hc client knows POST validation 400 union', () => {
    expectTypeOf<PostStatus>().toEqualTypeOf<201 | 400>();
  });
});
