import { resolve } from 'node:path';

import type { MethodInfo, TypeInfo } from '@zeltjs/decorator-metadata/inspect';
import { getTypeMetadata } from '@zeltjs/decorator-metadata/inspect';
import { describe, expect, it } from 'vitest';
import type { ControllerRouteInfo, RouteInfo } from './generate-openapi.lib';
import { buildResponseSchemaFromTypeInfo } from './generate-openapi.lib';
import { ReplyController } from './test/fixtures/reply.controller';

const controller: ControllerRouteInfo = { basePath: '/items', name: 'Items', routes: [] };
const route: RouteInfo = {
  method: 'GET',
  path: '/',
  fullPath: '/items',
  methodName: 'find',
};

const typedResponse = (body: TypeInfo, status: number): TypeInfo => ({
  kind: 'object',
  properties: [
    { name: '_data', type: body, optional: false },
    { name: '_status', type: { kind: 'literal', value: status }, optional: false },
    { name: '_format', type: { kind: 'literal', value: 'json' }, optional: false },
  ],
});

const method = (returnType: TypeInfo): MethodInfo => ({
  name: 'find',
  pos: undefined,
  props: [],
  params: [],
  returnType,
});

describe('OpenAPI response contracts', () => {
  it('extracts success, error and empty responses from a real controller', async () => {
    const metadata = await getTypeMetadata(ReplyController, {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
      expandStrategy: 'always',
    });
    expect(metadata.isOk()).toBe(true);
    if (metadata.isErr()) throw metadata.error;
    const schemas = {};
    const responses = buildResponseSchemaFromTypeInfo(
      controller,
      route,
      metadata.value.methods.find((item) => item.name === 'show'),
      schemas,
    );
    expect(Object.keys(responses)).toEqual(['200', '404', '500']);
    expect(JSON.stringify(schemas)).not.toContain('headerOperations');
    expect(JSON.stringify(schemas)).not.toContain('HTTP_REPLY_BRAND');
    expect(Object.values(schemas)).toContainEqual({
      type: 'object',
      properties: { code: { type: 'string' } },
      required: ['code'],
    });
    const empty = buildResponseSchemaFromTypeInfo(
      controller,
      route,
      metadata.value.methods.find((item) => item.name === 'empty'),
      {},
    );
    expect(empty).toEqual({ '204': { description: 'OK' } });
  });

  it('reads a branded HTTP reply without publishing its wrapper fields', () => {
    const schemas = {};
    const responses = buildResponseSchemaFromTypeInfo(
      controller,
      route,
      method({
        kind: 'object',
        properties: [
          {
            name: '__@HTTP_REPLY_BRAND@123',
            type: { kind: 'literal', value: true },
            optional: false,
          },
          { name: 'status', type: { kind: 'literal', value: 400 }, optional: false },
          { name: 'format', type: { kind: 'literal', value: 'json' }, optional: false },
          { name: 'body', type: { kind: 'primitive', type: 'string' }, optional: false },
        ],
      }),
      schemas,
    );
    expect(Object.keys(responses)).toEqual(['400']);
    expect(schemas).toEqual({ Items_find_Response: { type: 'string' } });
  });

  it('does not mistake a business DTO with status/body fields for an HTTP reply', () => {
    const schemas = {};
    const responses = buildResponseSchemaFromTypeInfo(
      controller,
      route,
      method({
        kind: 'object',
        properties: [
          { name: 'status', type: { kind: 'literal', value: 400 }, optional: false },
          { name: 'format', type: { kind: 'literal', value: 'json' }, optional: false },
          { name: 'body', type: { kind: 'primitive', type: 'string' }, optional: false },
        ],
      }),
      schemas,
    );
    expect(Object.keys(responses)).toEqual(['200']);
  });

  it('uses the status carried by TypedResponse', () => {
    const schemas = {};
    const responses = buildResponseSchemaFromTypeInfo(
      controller,
      route,
      method(typedResponse({ kind: 'primitive', type: 'string' }, 201)),
      schemas,
    );

    expect(responses).toEqual({
      '201': {
        description: 'OK',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Items_find_Response' },
          },
        },
      },
    });
    expect(schemas).toEqual({ Items_find_Response: { type: 'string' } });
  });

  it('emits each status from a union response', () => {
    const schemas = {};
    const responses = buildResponseSchemaFromTypeInfo(
      controller,
      route,
      method({
        kind: 'union',
        types: [
          typedResponse({ kind: 'primitive', type: 'string' }, 200),
          typedResponse({ kind: 'primitive', type: 'null' }, 404),
        ],
      }),
      schemas,
    );

    expect(Object.keys(responses)).toEqual(['200', '404']);
    expect(Object.keys(schemas)).toEqual([
      'Items_find_Response_200_0',
      'Items_find_Response_404_1',
    ]);
  });

  it('treats a plain object return as a 200 JSON response', () => {
    const schemas = {};
    const responses = buildResponseSchemaFromTypeInfo(
      controller,
      route,
      method({
        kind: 'object',
        properties: [{ name: 'id', type: { kind: 'primitive', type: 'number' }, optional: false }],
      }),
      schemas,
    );

    expect(Object.keys(responses)).toEqual(['200']);
    expect(schemas).toEqual({
      Items_find_Response: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
      },
    });
  });
});
