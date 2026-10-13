import type { TypedResponse as ReplyData, RequestBodyAccessor } from '@zeltjs/core';
import { response } from '@zeltjs/core';
import { hc } from 'hono/client';
import type { TypedResponse } from 'hono/types';
import { describe, expectTypeOf, it } from 'vitest';
import type { BuildAppType, ExtractResponse, Route } from './func2hono.types.js';

type DummyHandler = () => Promise<{ id: string }>;

// 50 routes to verify no TS2589
type ManyRoutes = BuildAppType<
  [
    Route<'GET', '/r01', DummyHandler>,
    Route<'GET', '/r02', DummyHandler>,
    Route<'GET', '/r03', DummyHandler>,
    Route<'GET', '/r04', DummyHandler>,
    Route<'GET', '/r05', DummyHandler>,
    Route<'GET', '/r06', DummyHandler>,
    Route<'GET', '/r07', DummyHandler>,
    Route<'GET', '/r08', DummyHandler>,
    Route<'GET', '/r09', DummyHandler>,
    Route<'GET', '/r10', DummyHandler>,
    Route<'GET', '/r11', DummyHandler>,
    Route<'GET', '/r12', DummyHandler>,
    Route<'GET', '/r13', DummyHandler>,
    Route<'GET', '/r14', DummyHandler>,
    Route<'GET', '/r15', DummyHandler>,
    Route<'GET', '/r16', DummyHandler>,
    Route<'GET', '/r17', DummyHandler>,
    Route<'GET', '/r18', DummyHandler>,
    Route<'GET', '/r19', DummyHandler>,
    Route<'GET', '/r20', DummyHandler>,
    Route<'GET', '/r21', DummyHandler>,
    Route<'GET', '/r22', DummyHandler>,
    Route<'GET', '/r23', DummyHandler>,
    Route<'GET', '/r24', DummyHandler>,
    Route<'GET', '/r25', DummyHandler>,
    Route<'GET', '/r26', DummyHandler>,
    Route<'GET', '/r27', DummyHandler>,
    Route<'GET', '/r28', DummyHandler>,
    Route<'GET', '/r29', DummyHandler>,
    Route<'GET', '/r30', DummyHandler>,
    Route<'GET', '/r31', DummyHandler>,
    Route<'GET', '/r32', DummyHandler>,
    Route<'GET', '/r33', DummyHandler>,
    Route<'GET', '/r34', DummyHandler>,
    Route<'GET', '/r35', DummyHandler>,
    Route<'GET', '/r36', DummyHandler>,
    Route<'GET', '/r37', DummyHandler>,
    Route<'GET', '/r38', DummyHandler>,
    Route<'GET', '/r39', DummyHandler>,
    Route<'GET', '/r40', DummyHandler>,
    Route<'GET', '/r41', DummyHandler>,
    Route<'GET', '/r42', DummyHandler>,
    Route<'GET', '/r43', DummyHandler>,
    Route<'GET', '/r44', DummyHandler>,
    Route<'GET', '/r45', DummyHandler>,
    Route<'POST', '/r01', DummyHandler>,
    Route<'PUT', '/r01', DummyHandler>,
    Route<'DELETE', '/r01', DummyHandler>,
    Route<'PATCH', '/r01', DummyHandler>,
    Route<'POST', '/r45', DummyHandler>,
  ]
>;

type Client = ReturnType<typeof hc<ManyRoutes>>;

describe('BuildSchema recursion depth', () => {
  it('handles 50 routes without TS2589', () => {
    expectTypeOf<Client['r01']['$get']>().toBeFunction();
    expectTypeOf<Client['r45']['$get']>().toBeFunction();
  });

  it('merges multiple methods on the same path', () => {
    expectTypeOf<Client['r01']['$get']>().toBeFunction();
    expectTypeOf<Client['r01']['$post']>().toBeFunction();
    expectTypeOf<Client['r01']['$put']>().toBeFunction();
    expectTypeOf<Client['r01']['$delete']>().toBeFunction();
    expectTypeOf<Client['r01']['$patch']>().toBeFunction();
  });
});

describe('WrapRaw distribution', () => {
  it('does not distribute union return types', () => {
    type UnionHandler = () => Promise<{ ok: true; data: string } | { ok: false; err: string }>;
    type Result = ExtractResponse<UnionHandler>;

    expectTypeOf<Result>().toEqualTypeOf<
      TypedResponse<{ ok: true; data: string } | { ok: false; err: string }, 200, 'json'>
    >();
  });
});

type ValidatedBody = { name: string };
type ValidatedHandler = (
  req?: RequestBodyAccessor<ValidatedBody>,
) => Promise<ReplyData<{ message: string }, 201, 'json'>>;

type ValidatedClient = ReturnType<
  typeof hc<BuildAppType<[Route<'POST', '/validated', ValidatedHandler>]>>
>;

describe('validated route response status', () => {
  it('includes validation error status in typed client response', () => {
    type Response = Awaited<ReturnType<ValidatedClient['validated']['$post']>>;

    expectTypeOf<Response['status']>().toEqualTypeOf<201 | 400>();
  });
});

describe('reply data conversion', () => {
  const _mixedHandler = (found: boolean) => {
    if (!found)
      return response().status(404).header('X-Reason', 'missing').json({ code: 'NOT_FOUND' });
    return { id: 'user-1' };
  };

  type MixedApp = BuildAppType<[Route<'GET', '/user', typeof _mixedHandler>]>;
  type MixedClient = ReturnType<typeof hc<MixedApp>>;

  it('keeps implicit JSON 200 separate from an explicit error reply', () => {
    type Result = Awaited<ReturnType<MixedClient['user']['$get']>>;
    expectTypeOf<Result['status']>().toEqualTypeOf<200 | 404>();
    expectTypeOf<ExtractResponse<typeof _mixedHandler>>().toEqualTypeOf<
      TypedResponse<{ id: string }, 200, 'json'> | TypedResponse<{ code: string }, 404, 'json'>
    >();
  });

  it('narrows the actual hc JSON result using the status', () => {
    const checkNarrowing = async () => {
      const client = hc<MixedApp>('http://localhost');
      const result = await client.user.$get();
      if (result.status === 200) expectTypeOf(await result.json()).toEqualTypeOf<{ id: string }>();
      else expectTypeOf(await result.json()).toEqualTypeOf<{ code: string }>();
    };
    expectTypeOf(checkNarrowing).toBeFunction();
  });

  it('converts serialized JSON data rather than exposing server-only Date values', () => {
    type DateHandler = () => { createdAt: Date };
    expectTypeOf<ExtractResponse<DateHandler>>().toEqualTypeOf<
      TypedResponse<{ createdAt: string }, 200, 'json'>
    >();
  });

  it('preserves explicit 300, 400, and 500 reply statuses', () => {
    type Handler = () => ReplyData<{ code: string }, 300 | 400 | 500, 'json'>;
    type ClientResponse = Awaited<
      ReturnType<
        ReturnType<typeof hc<BuildAppType<[Route<'GET', '/status', Handler>]>>>['status']['$get']
      >
    >;
    expectTypeOf<ClientResponse['status']>().toEqualTypeOf<300 | 400 | 500>();
  });

  it('maps redirects and empty replies without a JSON body', () => {
    type RedirectHandler = () => ReplyData<string, 302, 'redirect'>;
    type EmptyHandler = () => ReplyData<undefined, 204, 'empty'>;
    expectTypeOf<ExtractResponse<RedirectHandler>>().toEqualTypeOf<
      TypedResponse<undefined, 302, 'redirect'>
    >();
    expectTypeOf<ExtractResponse<EmptyHandler>>().toEqualTypeOf<
      TypedResponse<undefined, 204, 'body'>
    >();
  });
});
