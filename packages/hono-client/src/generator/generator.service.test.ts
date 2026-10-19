import { resolve } from 'node:path';

import { Controller } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import { GeneratorService } from './generator.service';
import type { ControllerClass, HttpMetadata } from './generator.types';
import DefaultController, {
  hiddenController,
  PublicController,
} from './test/fixtures/aliased.controller';

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
  it.each([
    [PublicController, 'PublicController as InternalController'],
    [DefaultController, 'default as DefaultController'],
  ] as const)('uses verified exports for %s', async (cls, binding) => {
    const output = await new GeneratorService().generateFromApp(
      {
        getMetadata: () => ({
          controllers: [
            {
              name: cls.name,
              basePath: '/',
              routes: [{ method: 'GET', path: '/', fullPath: '/', methodName: 'show' }],
            },
          ],
        }),
        getControllers: () => [cls],
      },
      { distDir: '/app/generated' },
    );
    expect(output).toContain(`import type { ${binding} }`);
    expect(output).toContain(`typeof ${cls.name}.prototype.show`);
  });

  it('reports an unexported controller before emitting an invalid import', async () => {
    const cls = hiddenController();
    await expect(
      new GeneratorService().generateFromApp(
        {
          getMetadata: () => ({ controllers: [{ name: cls.name, basePath: '/', routes: [] }] }),
          getControllers: () => [cls],
        },
        { distDir: '/app/generated' },
      ),
    ).rejects.toThrow('EXPORT_NOT_FOUND');
  });

  it('reports a controller missing from the application', async () => {
    await expect(
      new GeneratorService().generateFromApp(
        {
          getMetadata: () => ({
            controllers: [{ name: 'MissingController', basePath: '/', routes: [] }],
          }),
          getControllers: () => [],
        },
        { distDir: '/app/generated' },
      ),
    ).rejects.toThrow('MissingController is missing @Controller decorator');
  });
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
