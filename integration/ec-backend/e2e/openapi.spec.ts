import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SchemaResolver } from '@zeltjs/openapi';
import { generateOpenApi } from '@zeltjs/openapi';
import { valibotAdapter } from '@zeltjs/validator-valibot/openapi';
import { describe, expect, it } from 'vitest';

import { createEcApp } from '../src/app';

const tsconfig = resolve(__dirname, '../tsconfig.json');

const schemaResolver: SchemaResolver = async (modulePath) =>
  (await import(modulePath)) as Record<string, unknown>;

type OpenApiDoc = {
  paths: Record<string, Record<string, unknown>>;
  info: { title: string; version: string };
};

describe('OpenAPI generation', () => {
  it('generates spec with all endpoints', async () => {
    const app = createEcApp();
    const dist = await mkdtemp(join(tmpdir(), 'ec-openapi-'));
    await generateOpenApi(app.http, {
      distDir: dist,
      tsconfig,
      title: 'EC Backend API',
      version: '1.0.0',
      schemaAdapter: valibotAdapter,
      schemaResolver,
    });

    const doc = JSON.parse(await readFile(join(dist, 'openapi.json'), 'utf8')) as OpenApiDoc;

    expect(doc.info.title).toBe('EC Backend API');
    expect(doc.info.version).toBe('1.0.0');

    const paths = Object.keys(doc.paths);

    expect(paths).toContain('/api/auth/register');
    expect(paths).toContain('/api/auth/login');
    expect(paths).toContain('/api/auth/me');
    expect(paths).toContain('/api/products');
    expect(paths).toContain('/api/products/{id}');
    expect(paths).toContain('/api/cart');
    expect(paths).toContain('/api/cart/items');
    expect(paths).toContain('/api/cart/items/{productId}');
    expect(paths).toContain('/api/orders');
    expect(paths).toContain('/api/orders/{id}');
  });

  it('includes request body schemas for POST endpoints', async () => {
    const app = createEcApp();
    const dist = await mkdtemp(join(tmpdir(), 'ec-openapi-'));
    await generateOpenApi(app.http, {
      distDir: dist,
      tsconfig,
      title: 'EC Backend API',
      version: '1.0.0',
      schemaAdapter: valibotAdapter,
      schemaResolver,
    });

    const doc = JSON.parse(await readFile(join(dist, 'openapi.json'), 'utf8')) as OpenApiDoc;

    const registerPath = doc.paths['/api/auth/register'] as Record<
      string,
      { requestBody?: unknown }
    >;
    expect(registerPath?.post?.requestBody).toBeDefined();

    const productPath = doc.paths['/api/products'] as Record<string, { requestBody?: unknown }>;
    expect(productPath?.post?.requestBody).toBeDefined();
  });
});
