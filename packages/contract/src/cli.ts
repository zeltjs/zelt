#!/usr/bin/env node
// packages/contract/src/cli.ts
import { cac } from 'cac';
import { match } from 'ts-pattern';

import type { ContractError, ConfigError } from './errors';
import { generateClient } from './generate-client';
import type { GenerateClientOptions } from './config/options';
import { findConfigFile, loadConfig, isLoadConfigError } from './load-config';
import { watchClient } from './watch';

const formatAnalyzerError = (e: ContractError & { type: string }): string =>
  match(e)
    .with(
      { type: 'SOURCE_FILE_NOT_FOUND' },
      (x) => `zelt/openapi: source file not found: ${x.path}`,
    )
    .with(
      { type: 'CLASS_NOT_FOUND' },
      (x) => `zelt/openapi: class ${x.className} not found in ${x.path}`,
    )
    .with(
      { type: 'CONTROLLER_DECORATOR_MISSING' },
      (x) => `zelt/openapi: ${x.className} is missing @Controller decorator`,
    )
    .with(
      { type: 'DECORATOR_REQUIRES_STRING_LITERAL' },
      (x) => `zelt/openapi: @${x.decoratorName} requires a string literal argument`,
    )
    .with(
      { type: 'MODULE_RESOLVE_FAILED' },
      (x) => `zelt/openapi: cannot resolve module for validated(${x.exportName})`,
    )
    .with(
      { type: 'PATH_PARAM_REQUIRES_LITERAL' },
      () => `zelt/openapi: pathParam() requires a string literal argument`,
    )
    .otherwise(() => '');

const formatEmitError = (e: ContractError & { type: string }): string =>
  match(e)
    .with(
      { type: 'MODULE_NOT_OBJECT' },
      (x) => `zelt/openapi: ${x.modulePath} did not export an object module`,
    )
    .with(
      { type: 'EXPORT_NOT_FOUND' },
      (x) => `zelt/openapi: ${x.exportName} not found in ${x.modulePath}`,
    )
    .with(
      { type: 'INLINE_SCHEMA_NOT_SUPPORTED' },
      () => `zelt/openapi: inline schema not supported. Extract to module-level export.`,
    )
    .with(
      { type: 'NOT_VALIBOT_SCHEMA' },
      (x) => `zelt/openapi: ${x.exportName} in ${x.modulePath} is not a valibot schema`,
    )
    .with(
      { type: 'UNRESOLVABLE_RESPONSE_TYPE' },
      () => `zelt/openapi: handler return type is unknown/any. Add explicit return type.`,
    )
    .otherwise(() => '');

const formatConfigError = (e: ContractError & { type: string }): string =>
  match(e)
    .with({ type: 'CONFIG_NOT_FOUND' }, () => `zelt/openapi: no zelt.config.{ts,js,mts,mjs} found`)
    .with(
      { type: 'INVALID_CONFIG_EXPORT' },
      (x) => `zelt/openapi: ${x.path} must export a default GenerateClientOptions`,
    )
    .otherwise(() => '');

const formatError = (error: ContractError): string =>
  formatAnalyzerError(error) ||
  formatEmitError(error) ||
  formatConfigError(error) ||
  'zelt/openapi: unknown error';

const isContractError = (error: unknown): error is ContractError =>
  typeof error === 'object' && error !== null && 'type' in error;

const resolveConfig = async (
  configPath: string | undefined,
): Promise<GenerateClientOptions | ConfigError> => {
  const cfgPath = configPath ?? (await findConfigFile(process.cwd()));
  if (cfgPath === undefined) {
    return { type: 'CONFIG_NOT_FOUND' };
  }

  try {
    return await loadConfig(cfgPath);
  } catch (error) {
    if (isLoadConfigError(error)) {
      return error;
    }
    throw error;
  }
};

const isConfigError = (result: GenerateClientOptions | ConfigError): result is ConfigError =>
  'type' in result;

const buildAction = async (opts: { config?: string }): Promise<void> => {
  const configOrError = await resolveConfig(opts.config);
  if (isConfigError(configOrError)) {
    console.error(formatError(configOrError));
    process.exit(1);
  }

  try {
    const success = await generateClient(configOrError);
    console.log(
      `[zelt-openapi] built (app.gen.ts ${success.appGenChanged ? 'changed' : 'unchanged'}, openapi.json ${success.openApiChanged ? 'changed' : 'unchanged'})`,
    );
  } catch (error) {
    if (isContractError(error)) {
      console.error(formatError(error));
      process.exit(1);
    }
    throw error;
  }
};

const watchAction = async (opts: { config?: string }): Promise<void> => {
  const configOrError = await resolveConfig(opts.config);
  if (isConfigError(configOrError)) {
    console.error(formatError(configOrError));
    process.exit(1);
  }

  await watchClient({ ...configOrError, watch: true });
  console.log('[zelt-openapi] watching ...');
};

const cli = cac('zelt-openapi');

cli
  .command('build', 'Generate AppType + OpenAPI once')
  .option('-c, --config <path>', 'Path to zelt.config file')
  .action(buildAction);

cli
  .command('watch', 'Generate AppType + OpenAPI continuously')
  .option('-c, --config <path>', 'Path to zelt.config file')
  .action(watchAction);

cli.help();
cli.version('0.0.0');
cli.parse(process.argv, { run: false });
await cli.runMatchedCommand();
