import { pathToFileURL } from 'node:url';

import { getCommandMetadata, type CommandClass } from '@zeltjs/command';
import { fromPromise, okAsync, type ResultAsync } from 'neverthrow';
import { glob } from 'tinyglobby';

export type LoadCommandsError =
  | { type: 'GLOB_FAILED'; cause: unknown }
  | { type: 'IMPORT_FAILED'; file: string; cause: unknown };

const importModule = (file: string): ResultAsync<Record<string, unknown>, LoadCommandsError> =>
  fromPromise(
    import(pathToFileURL(file).href) as Promise<Record<string, unknown>>,
    (cause) => ({ type: 'IMPORT_FAILED', file, cause }) as const,
  );

const extractCommands = (module: Record<string, unknown>): Map<string, CommandClass> => {
  const commandMap = new Map<string, CommandClass>();
  for (const exportValue of Object.values(module)) {
    if (typeof exportValue === 'function') {
      const meta = getCommandMetadata(exportValue);
      if (meta) {
        commandMap.set(meta.name, exportValue as CommandClass);
      }
    }
  }
  return commandMap;
};

const importAndExtract = (
  file: string,
  commandMap: Map<string, CommandClass>,
): ResultAsync<void, LoadCommandsError> =>
  importModule(file).map((module) => {
    for (const [name, cls] of extractCommands(module)) {
      commandMap.set(name, cls);
    }
    return undefined;
  });

const importAllFiles = (
  files: string[],
  commandMap: Map<string, CommandClass>,
): ResultAsync<void, LoadCommandsError> =>
  files.reduce<ResultAsync<void, LoadCommandsError>>(
    (acc, file) => acc.andThen(() => importAndExtract(file, commandMap)),
    okAsync(undefined),
  );

export const loadCommands = (
  cwd: string,
  pattern: string,
): ResultAsync<Map<string, CommandClass>, LoadCommandsError> =>
  fromPromise(
    glob(pattern, { cwd, absolute: true }),
    (cause) => ({ type: 'GLOB_FAILED', cause }) as const,
  ).andThen((files) => {
    const commandMap = new Map<string, CommandClass>();
    return importAllFiles(files, commandMap).map(() => commandMap);
  });
