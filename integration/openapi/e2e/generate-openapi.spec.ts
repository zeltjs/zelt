import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { generateOpenApi } from '@zeltjs/openapi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

type OpenApiDoc = {
  openapi: string;
  paths: Record<
    string,
    Record<
      string,
      {
        requestBody?: { required?: boolean; content?: Record<string, { schema?: unknown }> };
        responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
      }
    >
  >;
  components: { schemas: Record<string, unknown> };
};

describe('generateOpenApi against a real app', () => {
  let distDir: string;
  let doc: OpenApiDoc;

  beforeAll(async () => {
    distDir = await mkdtemp(join(tmpdir(), 'zelt-openapi-integration-'));
    await generateOpenApi(app, {
      distDir,
      tsconfig: resolve(__dirname, '../tsconfig.json'),
    });
    doc = JSON.parse(await readFile(join(distDir, 'openapi.json'), 'utf8')) as OpenApiDoc;
  });

  afterAll(async () => {
    await rm(distDir, { recursive: true, force: true });
  });

  it('emits OpenAPI 3.1.0', () => {
    expect(doc.openapi).toBe('3.1.0');
  });

  it('registers all controller paths', () => {
    expect(doc.paths['/users']).toBeDefined();
    expect(doc.paths['/users/{id}']).toBeDefined();
  });

  it('generates request body schema for POST with required/optional properties', () => {
    const postOp = doc.paths['/users']?.['post'];
    expect(postOp?.requestBody).toBeDefined();
    expect(postOp?.requestBody?.required).toBe(true);

    const schemaName = 'UsersController_create_Request';
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

  it('generates response schema for GET /:id', () => {
    const schemaName = 'UsersController_show_Response';
    const schema = doc.components.schemas[schemaName] as {
      type: string;
      properties: Record<string, { type?: unknown }>;
    };
    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('id');
    expect(schema.properties).toHaveProperty('age');
  });

  it('represents nullable fields with JSON Schema 2020-12 type arrays (not nullable: true)', () => {
    const schema = doc.components.schemas['UsersController_show_Response'] as {
      properties: Record<string, { type?: unknown; nullable?: unknown }>;
    };
    // age: number | null
    const age = schema.properties['age'];
    expect(age).toBeDefined();
    expect(age?.nullable).toBeUndefined();
    expect(age?.type).toEqual(['number', 'null']);
  });

  it('generates array response schema for list endpoint', () => {
    const schema = doc.components.schemas['UsersController_list_Response'] as {
      type: string;
      items: unknown;
    };
    expect(schema.type).toBe('array');
    expect(schema.items).toBeDefined();
  });

  it('does not generate request body for DELETE', () => {
    const deleteOp = doc.paths['/users/{id}']?.['delete'];
    expect(deleteOp?.requestBody).toBeUndefined();
  });
});
