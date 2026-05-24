import { Controller } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import { GeneratorService } from './generator.service';
import type { ControllerClass, HttpMetadata } from './types';

@Controller('/users')
class UserController {
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

  it('generates AppType from app', () => {
    const service = new GeneratorService();
    const app = { getMetadata: () => metadata, getControllers: () => controllers };

    const output = service.generateFromApp(app, { distDir: '/app/generated' });

    expect(output).toContain("import type { Route, BuildAppType } from '@zeltjs/hono-client'");
    expect(output).toContain('import type { UserController }');
    expect(output).toContain('export type AppType = BuildAppType<[');
  });
});
