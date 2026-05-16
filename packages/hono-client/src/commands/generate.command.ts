import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { args, CliConfig, Command, cliSchema, inject, Logger } from '@zeltjs/core';

import type { HttpAppLike } from '../generator';
import { GeneratorService } from '../generator';

@Command({ name: 'generate', description: 'Generate Hono client types from metadata' })
export class GenerateCommand {
  static schema = cliSchema({
    options: [
      { name: 'app', type: 'string', description: 'Path to app file' },
      { name: 'dist', type: 'string', description: 'Output directory', default: './generated' },
      {
        name: 'output',
        type: 'string',
        alias: 'o',
        description: 'Output filename',
        default: 'app-type.ts',
      },
    ],
  });

  constructor(
    private readonly generator = inject(GeneratorService),
    private readonly cli = inject(CliConfig),
    private readonly logger = inject(Logger),
  ) {}

  async run(parsedArgs = args(GenerateCommand)): Promise<void> {
    const { app: appPath, dist, output } = parsedArgs;

    if (!appPath) {
      throw new Error('--app option is required');
    }

    const absolutePath = resolve(this.cli.cwd(), appPath);
    const fileUrl = pathToFileURL(absolutePath).href;
    const mod: { app?: HttpAppLike; default?: HttpAppLike } = await import(fileUrl);
    const httpApp = mod.app ?? mod.default;

    if (!httpApp || typeof httpApp.getMetadata !== 'function') {
      throw new Error(`Could not find app with getMetadata() in ${appPath}`);
    }

    const content = this.generator.generateFromApp(httpApp, { distDir: dist });
    const outputPath = resolve(dist, output);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');
    this.logger.info(`Generated: ${outputPath}`);
  }
}
