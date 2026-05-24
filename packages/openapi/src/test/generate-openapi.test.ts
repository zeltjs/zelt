import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Controller, Get, Post } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import type { ControllerClass, HttpMetadata } from '../generate-openapi';
import { generateOpenApi } from '../generate-openapi';

@Controller('/users')
class UserController {
  @Get('/:id')
  show() {
    return { id: '1' };
  }
  @Post('/')
  create() {
    return { id: '2' };
  }
}

@Controller('/items')
class ItemController {
  @Get('/')
  list() {
    return [];
  }
}

@Controller('/posts')
class PostController {
  @Get('/:postId/comments/:commentId')
  getComment() {
    return {};
  }
}

const createMockApp = (metadata: HttpMetadata, controllers: readonly ControllerClass[]) => ({
  getMetadata: () => metadata,
  getControllers: () => controllers,
});

describe('generateOpenApi', () => {
  it('writes openapi.json with basic structure', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
    const app = createMockApp(
      {
        controllers: [
          {
            basePath: '/users',
            name: 'UserController',
            routes: [
              { method: 'GET', path: '/:id', fullPath: '/users/:id', methodName: 'show' },
              { method: 'POST', path: '/', fullPath: '/users', methodName: 'create' },
            ],
          },
        ],
      },
      [UserController],
    );

    const result = await generateOpenApi(app, { distDir: dist });

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
    const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
    const app = createMockApp(
      {
        controllers: [
          {
            basePath: '/items',
            name: 'ItemController',
            routes: [{ method: 'GET', path: '/', fullPath: '/items', methodName: 'list' }],
          },
        ],
      },
      [ItemController],
    );

    await generateOpenApi(app, { distDir: dist });
    const secondResult = await generateOpenApi(app, { distDir: dist });

    expect(secondResult.changed).toBe(false);
  });

  it('converts path params from :id to {id} format', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'zelt-openapi-'));
    const app = createMockApp(
      {
        controllers: [
          {
            basePath: '/posts',
            name: 'PostController',
            routes: [
              {
                method: 'GET',
                path: '/:postId/comments/:commentId',
                fullPath: '/posts/:postId/comments/:commentId',
                methodName: 'getComment',
              },
            ],
          },
        ],
      },
      [PostController],
    );

    await generateOpenApi(app, { distDir: dist });

    const parsed = JSON.parse(await readFile(join(dist, 'openapi.json'), 'utf8')) as {
      paths: Record<string, unknown>;
    };
    expect(parsed.paths['/posts/{postId}/comments/{commentId}']).toBeDefined();
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
