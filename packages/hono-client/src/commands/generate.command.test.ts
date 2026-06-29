import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CliConfig, Config, Controller, runInCommandContext } from '@zeltjs/core';
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

  it('runs preBuild hooks from zelt config', async () => {
    const outputPath = join(tempDir, 'generated.txt');
    await writeFile(
      join(tempDir, 'zelt.config.ts'),
      `
        import { writeFile } from 'node:fs/promises';

        export default {
          app: () => ({}),
          plugins: [
            {
              name: 'fixture',
              preBuild: async () => {
                await writeFile(${JSON.stringify(outputPath)}, 'ok');
              },
            },
          ],
        };
      `,
    );

    const { target: command } = await createTestTarget(GenerateCommand, {
      configs: [createTestCliConfig(tempDir)],
    });

    const parsedArgs = { config: undefined };
    await expect(runInCommandContext({ parsedArgs }, () => command.run())).resolves.not.toThrow();
    await expect(readFile(outputPath, 'utf-8')).resolves.toBe('ok');
  });

  it('generates directly using GeneratorService', async () => {
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

    const output = await service.generateFromApp(
      { getMetadata: () => metadata, getControllers: () => controllers },
      { distDir: '/dist' },
    );

    expect(output).toContain('TestController');
    expect(output).toContain('/test');
  });

  it('throws when zelt config is missing app loader', async () => {
    await writeFile(join(tempDir, 'zelt.config.ts'), `export default {};`);

    const { target: command } = await createTestTarget(GenerateCommand, {
      configs: [createTestCliConfig(tempDir)],
    });

    const parsedArgs = { config: undefined };
    await expect(runInCommandContext({ parsedArgs }, () => command.run())).rejects.toThrow();
  });
});
