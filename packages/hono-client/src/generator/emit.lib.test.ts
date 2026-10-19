import { describe, expect, it } from 'vitest';
import type { ControllerWithSource } from './controller-sources.lib';
import { emitAppType, toRelativeImport } from './emit.lib';

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

  it('decodes percent-encoded characters in file:// URL', () => {
    const distDir = '/app/generated';
    const fileUrl = 'file:///app/src/controllers/user%20controller.ts';
    const result = toRelativeImport(distDir, fileUrl);
    expect(result).toBe('../src/controllers/user controller');
  });

  it('always uses forward slashes in output', () => {
    const distDir = '/app/generated';
    const filePath = '/app/src/controllers/userController.ts';
    const result = toRelativeImport(distDir, filePath);
    expect(result).not.toContain('\\');
  });
});

describe('emitAppType', () => {
  const controllers: readonly ControllerWithSource[] = [
    {
      basePath: '/users',
      name: 'UserController',
      source: { filePath: '/app/src/user.controller.ts', exportName: 'UserController' },
      routes: [
        { method: 'GET', path: '/:id', fullPath: '/users/:id', methodName: 'show' },
        { method: 'POST', path: '/', fullPath: '/users', methodName: 'create' },
      ],
    },
  ];

  it('emits valid TypeScript with Route entries', () => {
    const out = emitAppType({ controllers, distDir: '/app/generated' });
    expect(out).toContain("import type { Route, BuildAppType } from '@zeltjs/hono-client'");
    expect(out).toContain('import type { UserController }');
    expect(out).toMatch(/Route<'GET', '\/users\/:id', typeof UserController\.prototype\.show>/);
    expect(out).toMatch(/Route<'POST', '\/users', typeof UserController\.prototype\.create>/);
    expect(out).toContain('export type AppType = BuildAppType<[');
  });

  it('uses relative import path from distDir', () => {
    const out = emitAppType({ controllers, distDir: '/app/generated' });
    expect(out).toContain("from '");
    expect(out).toMatch(/import type \{ UserController \} from/);
  });

  it('strips .ts extension from import path', () => {
    const out = emitAppType({ controllers, distDir: '/app/generated' });
    expect(out).not.toContain('.ts');
  });

  it('marks file as generated', () => {
    const out = emitAppType({ controllers, distDir: '/app/generated' });
    expect(out).toContain('GENERATED');
    expect(out).toContain('DO NOT EDIT');
  });

  it.each([
    'PublicController',
    'default',
  ])('uses the actual export %s with a local binding', (exportName) => {
    const out = emitAppType({
      controllers: controllers.map((controller) => ({
        ...controller,
        source: { ...controller.source, exportName },
      })),
      distDir: '/app/generated',
    });
    expect(out).toContain(
      `import type { ${exportName} as UserController } from '../src/user.controller';`,
    );
    expect(out).toContain('typeof UserController.prototype.show');
  });
});
