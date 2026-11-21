import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp, http } from '@zeltjs/core';
import { getTypeMetadata } from '@zeltjs/decorator-metadata/inspect';
import { describe, expect, it } from 'vitest';
import { generateOpenApi } from './generate-openapi.lib';
import {
  InheritedController,
  SiblingController,
  UndecoratedChildController,
} from './test/fixtures/inherited.controller';

const tsconfig = resolve(__dirname, '../tsconfig.json');
const app = () => createApp([http({ controllers: [InheritedController, SiblingController] })]);

describe('HTTP method decorator inheritance', () => {
  it('executes inherited routes and replaces or removes overridden routes', async () => {
    const running = await app().createRuntime();
    try {
      const inherited = await running.http.request('/child/inherited/42');
      expect(inherited.status).toBe(200);
      expect(await inherited.json()).toEqual({ id: '42', label: 'inherited' });
      expect(await (await running.http.request('/child/new')).json()).toEqual({ label: 'child' });
      expect((await running.http.request('/child/old')).status).toBe(404);
      expect((await running.http.request('/child/removed')).status).toBe(404);
      expect(await (await running.http.request('/sibling/removed')).json()).toEqual({
        label: 'parent',
      });
    } finally {
      await running.shutdown();
    }
  });

  it('inspects inherited method signatures and only the child class annotation', async () => {
    const result = await getTypeMetadata(InheritedController, {
      tsconfig,
      expandStrategy: 'always',
    });
    if (result.isErr()) throw result.error;
    expect(result.value.props).toContainEqual({ decorator: 'Controller', basePath: '/child' });
    expect(result.value.methods.map(({ name }) => name).sort()).toEqual(['inherited', 'replaced']);
    expect(result.value.methods.find(({ name }) => name === 'inherited')).toMatchObject({
      params: [{ name: 'req' }],
      returnType: {
        kind: 'object',
        properties: [
          { name: 'id', type: { kind: 'primitive', type: 'string' } },
          { name: 'label', type: { kind: 'primitive', type: 'string' } },
        ],
      },
    });
    const sibling = await getTypeMetadata(SiblingController, { tsconfig });
    if (sibling.isErr()) throw sibling.error;
    expect(sibling.value.props.filter((prop) => 'basePath' in prop)).toEqual([
      { decorator: 'Controller', basePath: '/sibling' },
    ]);
  });

  it('generates OpenAPI for the effective routes with the inherited response shape', async () => {
    const root = resolve(__dirname, '../../../.tmp');
    await mkdir(root, { recursive: true });
    const distDir = await mkdtemp(resolve(root, 'openapi-inheritance-'));
    try {
      await generateOpenApi(app().http, { distDir, tsconfig });
      const content = await readFile(resolve(distDir, 'openapi.json'), 'utf8');
      const doc: unknown = JSON.parse(content);
      expect(doc).toMatchObject({
        paths: {
          '/child/inherited/{id}': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: {
                        $ref: '#/components/schemas/InheritedController_inherited_Response',
                      },
                    },
                  },
                },
              },
            },
          },
          '/child/new': { get: {} },
          '/sibling/removed': { get: {} },
        },
        components: {
          schemas: {
            InheritedController_inherited_Response: {
              type: 'object',
              properties: { id: { type: 'string' }, label: { type: 'string' } },
              required: ['id', 'label'],
            },
          },
        },
      });
      expect(content).not.toMatch(/\/child\/(?:old|removed)|\/parent\//);
    } finally {
      await rm(distDir, { recursive: true, force: true });
    }
  });

  it('requires an own Controller decorator even when the parent is a controller', () => {
    expect(() => createApp([http({ controllers: [UndecoratedChildController] })])).toThrow(
      /missing @Controller/,
    );
  });
});
