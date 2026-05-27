import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { generateOpenApi } from '@zeltjs/openapi';
import { describe, expect, it } from 'vitest';

import { app } from '../src/app';

type SchemaRef = { readonly $ref: string };
type ObjectSchema = {
  readonly type?: string;
  readonly properties?: Record<string, unknown>;
  readonly required?: readonly string[];
};
type OpenApiDoc = {
  readonly openapi: string;
  readonly info: { readonly title: string; readonly version: string };
  readonly paths: Record<
    string,
    Record<
      string,
      {
        readonly parameters?: ReadonlyArray<{
          readonly name: string;
          readonly in: string;
          readonly required: boolean;
          readonly schema: { readonly type: string };
        }>;
        readonly requestBody?: {
          readonly content: { readonly 'application/json': { readonly schema: SchemaRef } };
        };
        readonly responses?: Record<string, unknown>;
      }
    >
  >;
  readonly components: { readonly schemas: Record<string, ObjectSchema> };
};

const tsconfig = resolve(__dirname, '../tsconfig.json');

const generate = async (
  options: { title?: string; version?: string } = {},
): Promise<OpenApiDoc> => {
  const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
  await generateOpenApi(app, { distDir: dist, tsconfig, ...options });
  return JSON.parse(await readFile(join(dist, 'openapi.json'), 'utf8')) as OpenApiDoc;
};

describe('OpenAPI generation (hello-world)', () => {
  it('emits valid envelope with custom title and version', async () => {
    const doc = await generate({ title: 'Hello World API', version: '1.0.0' });

    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toBe('Hello World API');
    expect(doc.info.version).toBe('1.0.0');
  });

  it('emits path with parameters for GET /hello/:name', async () => {
    const doc = await generate();

    expect(doc.paths['/hello/{name}']).toBeDefined();
    const op = doc.paths['/hello/{name}']?.['get'];
    expect(op?.parameters).toContainEqual({
      name: 'name',
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });
  });

  it('derives request body schema from validated(Schema) default param', async () => {
    const doc = await generate();

    const postOp = doc.paths['/users']?.['post'];
    expect(postOp?.requestBody).toBeDefined();

    const ref = postOp?.requestBody?.content['application/json'].schema.$ref;
    expect(ref).toBeDefined();
    const schemaName = ref?.replace('#/components/schemas/', '');
    const schema = doc.components.schemas[schemaName];

    expect(schema?.type).toBe('object');
    expect(schema?.properties).toHaveProperty('name');
    expect(schema?.properties).toHaveProperty('email');
    expect(schema?.properties).toHaveProperty('age');
    expect(schema?.required).toContain('name');
    expect(schema?.required).toContain('email');
    expect(schema?.required).not.toContain('age');
  });

  it('returns changed=false on second run with no changes', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
    await generateOpenApi(app, { distDir: dist, tsconfig });
    const second = await generateOpenApi(app, { distDir: dist, tsconfig });
    expect(second.changed).toBe(false);
  });
});
