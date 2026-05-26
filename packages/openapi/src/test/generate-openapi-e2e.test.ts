import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ControllerClass, HttpMetadata } from '../generate-openapi';
import { generateOpenApi } from '../generate-openapi';

const createMockApp = (metadata: HttpMetadata, controllers: readonly ControllerClass[]) => ({
  getMetadata: () => metadata,
  getControllers: () => controllers,
});

type OpenApiDoc = {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, { requestBody?: unknown; responses?: unknown }>>;
  components: { schemas: Record<string, unknown> };
};

const generateAndParse = async (
  metadata: HttpMetadata,
  controllers: readonly ControllerClass[],
): Promise<OpenApiDoc> => {
  const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-e2e-'));
  const app = createMockApp(metadata, controllers);
  await generateOpenApi(app, {
    distDir: dist,
    tsconfig: resolve(__dirname, '../../tsconfig.json'),
  });
  return JSON.parse(await readFile(join(dist, 'openapi.json'), 'utf8')) as OpenApiDoc;
};

describe('generateOpenApi e2e - schema generation', () => {
  describe('basic CRUD operations', () => {
    it('generates request body schema for POST', async () => {
      const { TypedUserController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/users',
              name: 'TypedUserController',
              routes: [{ method: 'POST', path: '/', fullPath: '/users', methodName: 'create' }],
            },
          ],
        },
        [TypedUserController],
      );

      const postOp = doc.paths['/users']?.['post'];
      expect(postOp?.requestBody).toBeDefined();

      const schemaName = 'TypedUserController_create_Request';
      expect(doc.components.schemas[schemaName]).toBeDefined();

      const schema = doc.components.schemas[schemaName] as {
        type: string;
        properties: Record<string, unknown>;
        required?: string[];
      };
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('name');
      expect(schema.properties).toHaveProperty('email');
      expect(schema.properties).toHaveProperty('age');
      expect(schema.required).toContain('name');
      expect(schema.required).toContain('email');
      expect(schema.required).not.toContain('age');
    });

    it('generates response schema for GET', async () => {
      const { TypedUserController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/users',
              name: 'TypedUserController',
              routes: [{ method: 'GET', path: '/:id', fullPath: '/users/:id', methodName: 'show' }],
            },
          ],
        },
        [TypedUserController],
      );

      const getOp = doc.paths['/users/{id}']?.['get'];
      expect(getOp?.responses).toBeDefined();

      const schemaName = 'TypedUserController_show_Response';
      expect(doc.components.schemas[schemaName]).toBeDefined();

      const schema = doc.components.schemas[schemaName] as {
        type: string;
        properties: Record<string, unknown>;
      };
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('id');
      expect(schema.properties).toHaveProperty('name');
      expect(schema.properties).toHaveProperty('email');
      expect(schema.properties).toHaveProperty('age');
      expect(schema.properties).toHaveProperty('createdAt');
    });

    it('generates array response schema for list endpoint', async () => {
      const { TypedUserController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/users',
              name: 'TypedUserController',
              routes: [{ method: 'GET', path: '/', fullPath: '/users', methodName: 'list' }],
            },
          ],
        },
        [TypedUserController],
      );

      const schemaName = 'TypedUserController_list_Response';
      const schema = doc.components.schemas[schemaName] as { type: string; items: unknown };
      expect(schema.type).toBe('array');
      expect(schema.items).toBeDefined();
    });

    it('does not generate request body for GET', async () => {
      const { TypedUserController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/users',
              name: 'TypedUserController',
              routes: [{ method: 'GET', path: '/:id', fullPath: '/users/:id', methodName: 'show' }],
            },
          ],
        },
        [TypedUserController],
      );

      const getOp = doc.paths['/users/{id}']?.['get'];
      expect(getOp?.requestBody).toBeUndefined();
    });

    it('does not generate request body for DELETE', async () => {
      const { TypedUserController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/users',
              name: 'TypedUserController',
              routes: [
                { method: 'DELETE', path: '/:id', fullPath: '/users/:id', methodName: 'destroy' },
              ],
            },
          ],
        },
        [TypedUserController],
      );

      const deleteOp = doc.paths['/users/{id}']?.['delete'];
      expect(deleteOp?.requestBody).toBeUndefined();
    });
  });

  describe('nested objects', () => {
    it('generates schema for nested object properties', async () => {
      const { NestedObjectController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/addresses',
              name: 'NestedObjectController',
              routes: [
                { method: 'GET', path: '/:id', fullPath: '/addresses/:id', methodName: 'show' },
              ],
            },
          ],
        },
        [NestedObjectController],
      );

      const schemaName = 'NestedObjectController_show_Response';
      const schema = doc.components.schemas[schemaName] as {
        type: string;
        properties: Record<string, { type?: string; properties?: Record<string, unknown> }>;
      };

      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('address');

      const addressSchema = schema.properties['address'];
      expect(addressSchema?.type).toBe('object');
      expect(addressSchema?.properties).toHaveProperty('street');
      expect(addressSchema?.properties).toHaveProperty('city');
      expect(addressSchema?.properties).toHaveProperty('country');
    });

    it('generates schema for deeply nested objects', async () => {
      const { DeepNestedController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/profiles',
              name: 'DeepNestedController',
              routes: [
                { method: 'GET', path: '/:id', fullPath: '/profiles/:id', methodName: 'show' },
              ],
            },
          ],
        },
        [DeepNestedController],
      );

      const schemaName = 'DeepNestedController_show_Response';
      const schema = doc.components.schemas[schemaName] as {
        type: string;
        properties: Record<
          string,
          {
            type?: string;
            properties?: Record<string, { type?: string; properties?: unknown }>;
          }
        >;
      };

      expect(schema.properties).toHaveProperty('profile');
      const profileSchema = schema.properties['profile'];
      expect(profileSchema?.properties).toHaveProperty('social');

      const socialSchema = profileSchema?.properties?.['social'];
      expect(socialSchema?.properties).toHaveProperty('links');
    });
  });

  describe('arrays with nested objects', () => {
    it('generates schema for array of objects with nested properties', async () => {
      const { ArrayNestedController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/posts',
              name: 'ArrayNestedController',
              routes: [{ method: 'GET', path: '/:id', fullPath: '/posts/:id', methodName: 'show' }],
            },
          ],
        },
        [ArrayNestedController],
      );

      const schemaName = 'ArrayNestedController_show_Response';
      const schema = doc.components.schemas[schemaName] as {
        type: string;
        properties: Record<
          string,
          {
            type?: string;
            items?: { type?: string; properties?: unknown };
            properties?: unknown;
          }
        >;
      };

      expect(schema.properties).toHaveProperty('tags');
      const tagsSchema = schema.properties['tags'];
      expect(tagsSchema?.type).toBe('array');
      expect(tagsSchema?.items?.type).toBe('object');

      expect(schema.properties).toHaveProperty('author');
      const authorSchema = schema.properties['author'];
      expect(authorSchema?.type).toBe('object');
    });
  });

  describe('generic types', () => {
    it('generates schema for generic paginated response', async () => {
      const { GenericTypeController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/paginated',
              name: 'GenericTypeController',
              routes: [
                {
                  method: 'GET',
                  path: '/users',
                  fullPath: '/paginated/users',
                  methodName: 'listUsers',
                },
              ],
            },
          ],
        },
        [GenericTypeController],
      );

      const schemaName = 'GenericTypeController_listUsers_Response';
      const schema = doc.components.schemas[schemaName] as {
        type: string;
        properties: Record<string, { type?: string; items?: unknown }>;
        required?: string[];
      };

      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('items');
      expect(schema.properties).toHaveProperty('total');
      expect(schema.properties).toHaveProperty('page');
      expect(schema.properties).toHaveProperty('pageSize');

      const itemsSchema = schema.properties['items'];
      expect(itemsSchema?.type).toBe('array');
    });
  });

  describe('union and literal types', () => {
    it('generates schema for union literal types', async () => {
      const { UnionLiteralController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/status',
              name: 'UnionLiteralController',
              routes: [
                { method: 'GET', path: '/:id', fullPath: '/status/:id', methodName: 'show' },
              ],
            },
          ],
        },
        [UnionLiteralController],
      );

      const schemaName = 'UnionLiteralController_show_Response';
      const schema = doc.components.schemas[schemaName] as {
        type: string;
        properties: Record<string, unknown>;
      };

      expect(schema.properties).toHaveProperty('status');
    });
  });

  describe('edge cases', () => {
    it('handles void return type', async () => {
      const { TypedUserController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/users',
              name: 'TypedUserController',
              routes: [
                { method: 'DELETE', path: '/:id', fullPath: '/users/:id', methodName: 'destroy' },
              ],
            },
          ],
        },
        [TypedUserController],
      );

      const deleteOp = doc.paths['/users/{id}']?.['delete'];
      expect(deleteOp?.responses).toBeDefined();

      const responseSchemaName = 'TypedUserController_destroy_Response';
      expect(doc.components.schemas[responseSchemaName]).toBeUndefined();
    });

    it('handles optional properties correctly', async () => {
      const { TypedUserController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/users',
              name: 'TypedUserController',
              routes: [{ method: 'POST', path: '/', fullPath: '/users', methodName: 'create' }],
            },
          ],
        },
        [TypedUserController],
      );

      const schemaName = 'TypedUserController_create_Request';
      const schema = doc.components.schemas[schemaName] as {
        required?: string[];
      };

      expect(schema.required).not.toContain('age');
    });

    it('handles nullable properties (T | null)', async () => {
      const { TypedUserController } = await import('./fixtures/typed-controllers');

      const doc = await generateAndParse(
        {
          controllers: [
            {
              basePath: '/users',
              name: 'TypedUserController',
              routes: [{ method: 'GET', path: '/:id', fullPath: '/users/:id', methodName: 'show' }],
            },
          ],
        },
        [TypedUserController],
      );

      const schemaName = 'TypedUserController_show_Response';
      const schema = doc.components.schemas[schemaName] as {
        properties: Record<string, { type?: string; nullable?: boolean; oneOf?: unknown[] }>;
      };

      const ageSchema = schema.properties['age'];
      expect(ageSchema).toBeDefined();
    });
  });
});
