// packages/contract/src/watch.ts
import chokidar from 'chokidar';
import fg from 'fast-glob';
import { match } from 'ts-pattern';

import type { ContractError } from './errors';
import type { GenerateClientOptions } from './config/options';
import { generateClient } from './generate-client';

const formatError = (error: ContractError): string =>
  match(error)
    .with({ type: 'SOURCE_FILE_NOT_FOUND' }, (e) => `source file not found: ${e.path}`)
    .with({ type: 'CLASS_NOT_FOUND' }, (e) => `class ${e.className} not found in ${e.path}`)
    .with(
      { type: 'CONTROLLER_DECORATOR_MISSING' },
      (e) => `${e.className} is missing @Controller decorator`,
    )
    .with(
      { type: 'DECORATOR_REQUIRES_STRING_LITERAL' },
      (e) => `@${e.decoratorName} requires a string literal argument`,
    )
    .with(
      { type: 'MODULE_RESOLVE_FAILED' },
      (e) => `cannot resolve module for validated(${e.exportName})`,
    )
    .with(
      { type: 'PATH_PARAM_REQUIRES_LITERAL' },
      () => `pathParam() requires a string literal argument`,
    )
    .with({ type: 'MODULE_NOT_OBJECT' }, (e) => `${e.modulePath} did not export an object module`)
    .with({ type: 'EXPORT_NOT_FOUND' }, (e) => `${e.exportName} not found in ${e.modulePath}`)
    .with(
      { type: 'INLINE_SCHEMA_NOT_SUPPORTED' },
      () => `inline schema not supported. Extract to module-level export.`,
    )
    .with(
      { type: 'NOT_VALIBOT_SCHEMA' },
      (e) => `${e.exportName} in ${e.modulePath} is not a valibot schema`,
    )
    .with(
      { type: 'UNRESOLVABLE_RESPONSE_TYPE' },
      () => `handler return type is unknown/any. Add explicit return type.`,
    )
    .with({ type: 'CONFIG_NOT_FOUND' }, () => `config file not found`)
    .with(
      { type: 'INVALID_CONFIG_EXPORT' },
      (e) => `${e.path} must export a default GenerateClientOptions`,
    )
    .with(
      { type: 'REQUEST_VALIDATOR_REQUIRED' },
      () =>
        `requestValidator is required when routes use validated(). Provide a SchemaAdapter in config.`,
    )
    .exhaustive();

export const watchClient = async (options: GenerateClientOptions): Promise<() => Promise<void>> => {
  const watchedPaths = fg.sync([...options.controllers], { absolute: true });

  const initialResult = await generateClient(options);
  if (initialResult.isErr()) {
    console.error('[zelt-openapi] initial generation failed:', formatError(initialResult.error));
  }

  const watcher = chokidar.watch(watchedPaths, { ignoreInitial: true });
  watcher.on('change', (path) => {
    void (async (): Promise<void> => {
      const result = await generateClient(options);
      result.match(
        (success) => {
          console.log(
            `[zelt-openapi] regenerated (app.gen.ts ${success.appGenChanged ? 'changed' : 'unchanged'}, openapi.json ${success.openApiChanged ? 'changed' : 'unchanged'}) — trigger: ${path}`,
          );
        },
        (error) => {
          console.error('[zelt-openapi] regeneration failed:', formatError(error));
        },
      );
    })();
  });

  return async (): Promise<void> => {
    await watcher.close();
  };
};
