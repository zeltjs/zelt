import { describe, expect, it } from 'vitest';

import { emitAppType } from './emit.lib';
import type { HttpMetadata } from './types';

describe('emitAppType', () => {
  const metadata: HttpMetadata = {
    controllers: [
      {
        basePath: '/users',
        sourceFile: '/app/src/controllers/user.controller.ts',
        name: 'UserController',
        routes: [
          { method: 'GET', path: '/:id', fullPath: '/users/:id', methodName: 'show' },
          { method: 'POST', path: '/', fullPath: '/users', methodName: 'create' },
        ],
      },
    ],
  };

  it('emits valid TypeScript with Route entries', () => {
    const out = emitAppType(metadata, '/app/generated');
    expect(out).toContain("import type { Route, BuildAppType } from '@zeltjs/hono-client'");
    expect(out).toContain('import type { UserController }');
    expect(out).toMatch(/Route<'GET', '\/users\/:id', typeof UserController\.prototype\.show>/);
    expect(out).toMatch(/Route<'POST', '\/users', typeof UserController\.prototype\.create>/);
    expect(out).toContain('export type AppType = BuildAppType<[');
  });

  it('uses relative import path from distDir', () => {
    const out = emitAppType(metadata, '/app/generated');
    expect(out).toContain("from '../src/controllers/user.controller'");
  });

  it('strips .ts extension from import path', () => {
    const out = emitAppType(metadata, '/app/generated');
    expect(out).not.toContain('.ts');
  });

  it('marks file as generated', () => {
    const out = emitAppType(metadata, '/app/generated');
    expect(out).toContain('GENERATED');
    expect(out).toContain('DO NOT EDIT');
  });

  it('throws when controller has no sourceFile', () => {
    const noSourceMeta: HttpMetadata = {
      controllers: [
        {
          basePath: '/',
          sourceFile: undefined,
          name: 'AnonymousController',
          routes: [{ method: 'GET', path: '/', fullPath: '/', methodName: 'index' }],
        },
      ],
    };
    expect(() => emitAppType(noSourceMeta, '/app/generated')).toThrow(
      'Controller "AnonymousController" has no sourceFile',
    );
  });
});
