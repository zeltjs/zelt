import { resolve } from 'node:path';

import { Controller } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';
import type { ControllerClass, HttpMetadata } from './generator.types';
import { PortableAppTypeEmitterService } from './portable-app-type-emitter.service';

@Controller('/users')
export class UserController {
  show(): { id: string; name: string } {
    return { id: '1', name: 'test' };
  }

  create(): { id: string; name: string } {
    return { id: '2', name: 'created' };
  }
}

@Controller('/posts')
export class PostController {
  list(): { title: string }[] {
    return [{ title: 'hello' }];
  }
}

const singleControllerMetadata: HttpMetadata = {
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
};

const multiControllerMetadata: HttpMetadata = {
  controllers: [
    {
      basePath: '/users',
      name: 'UserController',
      routes: [{ method: 'GET', path: '/:id', fullPath: '/users/:id', methodName: 'show' }],
    },
    {
      basePath: '/posts',
      name: 'PostController',
      routes: [{ method: 'GET', path: '/', fullPath: '/posts', methodName: 'list' }],
    },
  ],
};

const distDir = resolve(__dirname, '../../generated');
const tsconfig = resolve(__dirname, '../../tsconfig.json');
const projectRoot = resolve(__dirname, '../..');
const portableTestTimeout = 30_000;

describe('emitPortableAppType', () => {
  const emitter = new PortableAppTypeEmitterService();

  it(
    'generates portable output for GET endpoint',
    async () => {
      const result = await emitter.emit({
        metadata: singleControllerMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain('$get');
      expect(result.value).toContain('/users/:id');
      expect(result.value).toContain('id: string');
      expect(result.value).toContain('name: string');
    },
    portableTestTimeout,
  );

  it(
    'generates portable output for POST endpoint',
    async () => {
      const result = await emitter.emit({
        metadata: singleControllerMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain('$post');
      expect(result.value).toContain('/users');
    },
    portableTestTimeout,
  );

  it(
    'does not contain controller imports',
    async () => {
      const result = await emitter.emit({
        metadata: singleControllerMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).not.toContain('UserController');
      expect(result.value).not.toContain('import type { UserController');
    },
    portableTestTimeout,
  );

  it(
    'uses import() syntax for external hono types',
    async () => {
      const result = await emitter.emit({
        metadata: singleControllerMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain("import('hono').Hono");
      expect(result.value).not.toContain(projectRoot);
    },
    portableTestTimeout,
  );

  it(
    'handles multiple controllers',
    async () => {
      const result = await emitter.emit({
        metadata: multiControllerMetadata,
        controllers: [UserController, PostController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain('/users/:id');
      expect(result.value).toContain('/posts');
      expect(result.value).toContain('$get');
      expect(result.value).toContain('title: string');
    },
    portableTestTimeout,
  );

  it(
    'includes generated file header',
    async () => {
      const result = await emitter.emit({
        metadata: singleControllerMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain('THIS FILE IS GENERATED');
      expect(result.value).toContain('export type AppType =');
    },
    portableTestTimeout,
  );

  it(
    'returns error for invalid tsconfig',
    async () => {
      const result = await emitter.emit({
        metadata: singleControllerMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig: '/nonexistent/tsconfig.json',
        projectRoot,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.kind).toBe('tsconfig_error');
    },
    portableTestTimeout,
  );
});
