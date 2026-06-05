import { loadZeltConfig, runPreBuildHooks } from '@zeltjs/cli';
import { args, CliConfig, Command, cliSchema, inject, Logger } from '@zeltjs/core';

@Command({ name: 'generate', description: 'Generate Hono client types from metadata' })
export class GenerateCommand {
  static readonly schema = cliSchema({
    options: [{ name: 'config', type: 'string', description: 'Path to zelt config file' }],
  });

  constructor(
    private readonly cli = inject(CliConfig),
    private readonly logger = inject(Logger),
  ) {}

  /** @throws {ZeltConfigLoadError | ZeltMultipleBuildHooksError | ZeltContextNotAvailableError} */
  async run(parsedArgs = args(GenerateCommand)): Promise<void> {
    const { config: configFile } = parsedArgs;
    const cwd = this.cli.cwd();
    const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
    await runPreBuildHooks({ cwd, config, loadStaticApp: async () => config.app() });
    this.logger.info('Generated from zelt config');
  }
}
