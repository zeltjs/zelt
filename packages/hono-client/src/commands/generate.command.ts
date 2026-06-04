import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  args,
  CliConfig,
  Command,
  cliSchema,
  inject,
  Logger,
  ZeltCommandArgumentError,
  ZeltPluginConfigurationError,
} from '@zeltjs/core';

import type { HttpAppLike } from '../generator';
import { GeneratorService } from '../generator';

type AppModule = {
  app?: { http?: HttpAppLike } | HttpAppLike;
  default?: { http?: HttpAppLike } | HttpAppLike;
};

const resolveHttpApp = (mod: AppModule): HttpAppLike | undefined => {
  const exported = mod.app ?? mod.default;
  if (!exported) return undefined;

  if (typeof (exported as HttpAppLike).getMetadata === 'function') {
    return exported as HttpAppLike;
  }

  const namespaced = exported as { http?: HttpAppLike };
  if (namespaced.http && typeof namespaced.http.getMetadata === 'function') {
    return namespaced.http;
  }

  return undefined;
};

@Command({ name: 'generate', description: 'Generate Hono client types from metadata' })
export class GenerateCommand {
  static readonly schema = cliSchema({
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

  /** @throws {ZeltCommandArgumentError | ZeltPluginConfigurationError | ZeltContextNotAvailableError} */
  async run(parsedArgs = args(GenerateCommand)): Promise<void> {
    const { app: appPath, dist, output } = parsedArgs;

    if (!appPath) {
      throw new ZeltCommandArgumentError({
        commandName: 'generate',
        argument: '--app',
        reason: 'required',
      });
    }

    const absolutePath = resolve(this.cli.cwd(), appPath);
    const fileUrl = pathToFileURL(absolutePath).href;
    const mod: AppModule = await import(fileUrl);
    const httpApp = resolveHttpApp(mod);

    if (!httpApp || typeof httpApp.getControllers !== 'function') {
      throw new ZeltPluginConfigurationError({
        pluginName: 'hono-client',
        reason: 'app_not_found',
        details: appPath,
      });
    }

    const content = this.generator.generateFromApp(httpApp, { distDir: dist });
    const outputPath = resolve(dist, output);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');
    this.logger.info(`Generated: ${outputPath}`);
  }
}
