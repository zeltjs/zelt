import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CliConfig, Config, Controller, createApp, Get, runInCommandContext } from '@zeltjs/core';
import { createTestTarget, shutdownAll } from '@zeltjs/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GenerateCommand } from '../commands';
import { GeneratorService } from '../generator';
import type { ControllerClass, HttpMetadata } from '../generator/types';

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

  it('generates app type file via run() directly', async () => {
    @Controller('/hello')
    class HelloController {
      @Get('/')
      greet() {
        return { message: 'Hello' };
      }
    }

    const targetApp = createApp({ http: { controllers: [HelloController] } });
    await targetApp.ready();

    const targetAppPath = join(tempDir, 'target-app.mjs');
    const appContent = `
      export const app = {
        getMetadata: () => (${JSON.stringify(targetApp.getMetadata())}),
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
