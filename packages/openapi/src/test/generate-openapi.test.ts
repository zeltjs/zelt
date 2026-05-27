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

const tsconfigPath = resolve(__dirname, '../../tsconfig.json');

describe('generateOpenApi', () => {
  it('writes openapi.json with basic structure', async () => {
    const { TypedUserController } = await import('./fixtures/typed-controllers');
    const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
    const app = createMockApp(
      {
        controllers: [
          {
            basePath: '/users',
            name: 'TypedUserController',
            routes: [
              { method: 'GET', path: '/:id', fullPath: '/users/:id', methodName: 'show' },
              { method: 'POST', path: '/', fullPath: '/users', methodName: 'create' },
            ],
          },
        ],
      },
      [TypedUserController],
    );

    const result = await generateOpenApi(app, { distDir: dist, tsconfig: tsconfigPath });

    expect(result.changed).toBe(true);

    const parsed = JSON.parse(await readFile(join(dist, 'openapi.json'), 'utf8')) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(parsed.openapi).toBe('3.1.0');
    expect(parsed.paths['/users/{id}']).toBeDefined();
    expect(parsed.paths['/users']).toBeDefined();
  });

  it('returns changed=false on second run with no changes', async () => {
    const { TypedUserController } = await import('./fixtures/typed-controllers');
    const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
    const app = createMockApp(
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

    await generateOpenApi(app, { distDir: dist, tsconfig: tsconfigPath });
    const secondResult = await generateOpenApi(app, { distDir: dist, tsconfig: tsconfigPath });

    expect(secondResult.changed).toBe(false);
  });

  it('converts path params from :id to {id} format', async () => {
    const { TypedUserController } = await import('./fixtures/typed-controllers');
    const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
    const app = createMockApp(
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

    await generateOpenApi(app, { distDir: dist, tsconfig: tsconfigPath });

    const parsed = JSON.parse(await readFile(join(dist, 'openapi.json'), 'utf8')) as {
      paths: Record<string, unknown>;
    };
    expect(parsed.paths['/users/{id}']).toBeDefined();
  });

  it('includes custom title and version', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
    const app = createMockApp({ controllers: [] }, []);

    await generateOpenApi(app, {
      distDir: dist,
      title: 'My API',
      version: '1.0.0',
    });

    const parsed = JSON.parse(await readFile(join(dist, 'openapi.json'), 'utf8')) as {
      info: { title: string; version: string };
    };
    expect(parsed.info.title).toBe('My API');
    expect(parsed.info.version).toBe('1.0.0');
  });
});
