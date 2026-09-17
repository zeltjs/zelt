import { loadZeltConfig, runPreBuildHooks } from '@zeltjs/cli';
import { args, CliConfig, Command, inject, Logger } from '@zeltjs/core';

import { generateSchema } from './generate-schema.lib';

@Command({ name: 'generate', description: 'Generate Hono client types from metadata' })
export class GenerateCommand {
  constructor(
    private readonly cli = inject(CliConfig),
    private readonly logger = inject(Logger),
  ) {}

  /** @throws {ZeltConfigLoadError | ZeltMultipleBuildHooksError | ZeltContextNotAvailableError | ZeltNotImplementedError | ZeltCommandExecutionError} */
  async run(parsedArgs = args(generateSchema)): Promise<void> {
    const { config: configFile } = parsedArgs;
    const cwd = this.cli.cwd();
    const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
    // This command only regenerates the hono client; it doesn't run a full
    // build, so it has no output ledger to prune against.
    await runPreBuildHooks({
      cwd,
      config,
      loadStaticApp: async () => config.app(),
      registerGeneratedFile: () => {},
    });
    this.logger.info('Generated from zelt config');
  }
}
