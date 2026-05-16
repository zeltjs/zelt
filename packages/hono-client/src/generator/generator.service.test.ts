import { describe, expect, it } from 'vitest';
import { GeneratorService } from './generator.service';
import type { HttpMetadata } from './types';

describe('GeneratorService', () => {
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

  it('generates AppType from metadata', () => {
    const service = new GeneratorService();

    const output = service.generate(metadata, { distDir: '/app/generated' });

    expect(output).toContain("import type { Route, BuildAppType } from '@zeltjs/hono-client'");
    expect(output).toContain('import type { UserController }');
    expect(output).toMatch(/Route<'GET', '\/users\/:id', typeof UserController\.prototype\.show>/);
    expect(output).toMatch(/Route<'POST', '\/users', typeof UserController\.prototype\.create>/);
  });

  it('generates AppType from app', () => {
    const service = new GeneratorService();
    const app = { getMetadata: () => metadata };

    const output = service.generateFromApp(app, { distDir: '/app/generated' });

    expect(output).toContain('export type AppType = BuildAppType<[');
  });
});
