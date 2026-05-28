import { Controller } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import { emitAppType, toRelativeImport } from './emit.lib';
import type { ControllerClass, HttpMetadata } from './generator.types';

describe('toRelativeImport', () => {
  it('handles file:// URL by stripping protocol and converting to relative path', () => {
    const distDir = '/app/generated';
    const fileUrl = 'file:///app/src/controllers/userController.ts';
    const result = toRelativeImport(distDir, fileUrl);
    expect(result).toBe('../src/controllers/userController');
  });

  it('handles normal file path', () => {
    const distDir = '/app/generated';
    const filePath = '/app/src/controllers/userController.ts';
    const result = toRelativeImport(distDir, filePath);
    expect(result).toBe('../src/controllers/userController');
  });

  it('adds ./ prefix for same directory', () => {
    const distDir = '/app/generated';
    const filePath = '/app/generated/types.ts';
    const result = toRelativeImport(distDir, filePath);
    expect(result).toBe('./types');
  });
});

@Controller('/users')
class UserController {
  show() {
    return 'show';
  }
  create() {
    return 'create';
  }
}

describe('emitAppType', () => {
  const metadata: HttpMetadata = {
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

  const controllers: readonly ControllerClass[] = [UserController];

  it('emits valid TypeScript with Route entries', () => {
    const out = emitAppType({ metadata, controllers, distDir: '/app/generated' });
    expect(out).toContain("import type { Route, BuildAppType } from '@zeltjs/hono-client'");
    expect(out).toContain('import type { UserController }');
    expect(out).toMatch(/Route<'GET', '\/users\/:id', typeof UserController\.prototype\.show>/);
    expect(out).toMatch(/Route<'POST', '\/users', typeof UserController\.prototype\.create>/);
    expect(out).toContain('export type AppType = BuildAppType<[');
  });

  it('uses relative import path from distDir', () => {
    const out = emitAppType({ metadata, controllers, distDir: '/app/generated' });
    expect(out).toContain("from '");
    expect(out).toMatch(/import type \{ UserController \} from/);
  });

  it('strips .ts extension from import path', () => {
    const out = emitAppType({ metadata, controllers, distDir: '/app/generated' });
    expect(out).not.toContain('.ts');
  });

  it('marks file as generated', () => {
    const out = emitAppType({ metadata, controllers, distDir: '/app/generated' });
    expect(out).toContain('GENERATED');
    expect(out).toContain('DO NOT EDIT');
  });

  it('throws when controller class is missing', () => {
    const noControllersMeta: HttpMetadata = {
      controllers: [
        {
          basePath: '/',
          name: 'AnonymousController',
          routes: [{ method: 'GET', path: '/', fullPath: '/', methodName: 'index' }],
        },
      ],
    };
    expect(() =>
      emitAppType({ metadata: noControllersMeta, controllers: [], distDir: '/app/generated' }),
    ).toThrow('AnonymousController is missing @Controller decorator');
  });
});
