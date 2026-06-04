import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CliConfig,
  Config,
  Controller,
  createApp,
  Get,
  http,
  runInCommandContext,
} from '@zeltjs/core';
import { createTestTarget, shutdownAll } from '@zeltjs/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GenerateCommand } from '../commands';
import { GeneratorService } from '../generator';
import type { ControllerClass, HttpMetadata } from '../generator/generator.types';

const createTestCliConfig = (cwd: string): typeof CliConfig => {
  @Config
  class TestCliConfig extends CliConfig {
    override cwd(): string {
      return cwd;
    }
  }
  return TestCliConfig;
};

@Controller('/test')
class TestController {
  index() {
    return 'index';
  }
}

describe('GenerateCommand', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `hono-client-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await shutdownAll();
  });

  it('resolves app with new Feature API (app.http namespace)', async () => {
    const targetAppPath = join(tempDir, 'target-app.mjs');
    const appContent = `
      export const app = {
        http: {
          getMetadata: () => ({ controllers: [] }),
          getControllers: () => []
        }
      };
    `;
    await writeFile(targetAppPath, appContent);

    const { target: command } = await createTestTarget(GenerateCommand, {
      configs: [createTestCliConfig(tempDir)],
    });

    const parsedArgs = { app: targetAppPath, dist: tempDir, output: 'types.ts' };
    await expect(runInCommandContext({ parsedArgs }, () => command.run())).resolves.not.toThrow();
  });

  it('throws when controller class is missing from getControllers', async () => {
    @Controller('/hello')
    class HelloController {
      @Get('/')
      greet() {
        return { message: 'Hello' };
      }
    }

    const targetApp = createApp([http({ controllers: [HelloController] })]);

    const targetAppPath = join(tempDir, 'target-app.mjs');
    const appContent = `
      export const app = {
        getMetadata: () => (${JSON.stringify(targetApp.http.getMetadata())}),
        getControllers: () => []
      };
    `;
    await writeFile(targetAppPath, appContent);

    const { target: command } = await createTestTarget(GenerateCommand, {
      configs: [createTestCliConfig(tempDir)],
    });

    const parsedArgs = { app: targetAppPath, dist: tempDir, output: 'types.ts' };
    await expect(runInCommandContext({ parsedArgs }, () => command.run())).rejects.toThrow(
      'HelloController is missing @Controller decorator',
    );
  });

  it('generates directly using GeneratorService', () => {
    const service = new GeneratorService();
    const metadata: HttpMetadata = {
      controllers: [
        {
          basePath: '/test',
          name: 'TestController',
          routes: [{ method: 'GET', path: '/', fullPath: '/test', methodName: 'index' }],
        },
      ],
    };
    const controllers: readonly ControllerClass[] = [TestController];

    const output = service.generateFromApp(
      { getMetadata: () => metadata, getControllers: () => controllers },
      { distDir: '/dist' },
    );

    expect(output).toContain('TestController');
    expect(output).toContain('/test');
  });

  it('throws error without app option', async () => {
    const { target: command } = await createTestTarget(GenerateCommand, {
      configs: [createTestCliConfig(tempDir)],
    });

    const parsedArgs = { app: undefined, dist: tempDir, output: 'types.ts' };
    await expect(runInCommandContext({ parsedArgs }, () => command.run())).rejects.toThrow(
      '[generate] --app: required',
    );
  });
});
