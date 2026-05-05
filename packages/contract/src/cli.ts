#!/usr/bin/env node
import { cac } from 'cac';

import { generateClient } from './generate-client';
import { findConfigFile, loadConfig } from './load-config';
import { watchClient } from './watch';

const cli = cac('zelt-openapi');

const resolveConfigPath = async (provided: string | undefined): Promise<string> => {
  if (provided !== undefined) return provided;
  const found = await findConfigFile(process.cwd());
  if (found === undefined) {
    throw new Error('zelt/openapi: no zelt.config.{ts,js,mts,mjs} found in cwd');
  }
  return found;
};

cli
  .command('build', 'Generate AppType + OpenAPI once')
  .option('-c, --config <path>', 'Path to zelt.config file')
  .action(async (opts: { config?: string }) => {
    const cfgPath = await resolveConfigPath(opts.config);
    const cfg = await loadConfig(cfgPath);
    const result = await generateClient(cfg);
    console.log(
      `[zelt-openapi] built (app.gen.ts ${result.appGenChanged ? 'changed' : 'unchanged'}, openapi.json ${result.openApiChanged ? 'changed' : 'unchanged'})`,
    );
  });

cli
  .command('watch', 'Generate AppType + OpenAPI continuously')
  .option('-c, --config <path>', 'Path to zelt.config file')
  .action(async (opts: { config?: string }) => {
    const cfgPath = await resolveConfigPath(opts.config);
    const cfg = await loadConfig(cfgPath);
    await watchClient({ ...cfg, watch: true });
    console.log('[zelt-openapi] watching ...');
  });

cli.help();
cli.version('0.0.0');
cli.parse(process.argv, { run: false });
await cli.runMatchedCommand();
