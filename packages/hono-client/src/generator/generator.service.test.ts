import { resolve } from 'node:path';

import { Controller } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import { GeneratorService } from './generator.service';
import type { ControllerClass, HttpMetadata } from './generator.types';

const portableTestTimeout = 30_000;

@Controller('/users')
export class UserController {
  show() {
    return 'show';
  }
  create() {
    return 'create';
  }
}

describe('GeneratorService', () => {
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

  it('generates AppType from app', async () => {
    const service = new GeneratorService();
    const app = { getMetadata: () => metadata, getControllers: () => controllers };

    const output = await service.generateFromApp(app, { distDir: '/app/generated' });

    expect(output).toContain("import type { Route, BuildAppType } from '@zeltjs/hono-client'");
    expect(output).toContain('import type { UserController }');
    expect(output).toContain('export type AppType = BuildAppType<[');
  });

  it(
    'generates portable AppType from app',
    async () => {
      const service = new GeneratorService();
      const app = { getMetadata: () => metadata, getControllers: () => controllers };

      const output = await service.generateFromApp(app, {
        distDir: resolve(__dirname, '../../generated'),
        portable: true,
        projectRoot: resolve(__dirname, '../..'),
        tsconfig: resolve(__dirname, '../../tsconfig.json'),
      });

      expect(output).toContain("export type AppType = import('hono').Hono<");
      expect(output).not.toContain('import type { UserController }');
      expect(output).not.toContain('BuildAppType');
    },
    portableTestTimeout,
  );
});
