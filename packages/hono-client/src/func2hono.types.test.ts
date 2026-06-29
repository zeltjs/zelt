import type { RequestBodyAccessor } from '@zeltjs/core';
import type { hc } from 'hono/client';
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
) => Promise<TypedResponse<{ message: string }, 201, 'json'>>;

type ValidatedClient = ReturnType<
  typeof hc<BuildAppType<[Route<'POST', '/validated', ValidatedHandler>]>>
>;

describe('validated route response status', () => {
  it('includes validation error status in typed client response', () => {
    type Response = Awaited<ReturnType<ValidatedClient['validated']['$post']>>;

    expectTypeOf<Response['status']>().toEqualTypeOf<201 | 400>();
  });
});
