import type { MethodInfo, TypeInfo } from '@zeltjs/decorator-metadata/inspect';
import { describe, expect, it } from 'vitest';
import type { ControllerRouteInfo, RouteInfo } from './generate-openapi.lib';
import { buildResponseSchemaFromTypeInfo } from './generate-openapi.lib';

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
