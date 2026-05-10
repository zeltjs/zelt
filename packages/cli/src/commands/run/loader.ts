import { pathToFileURL } from 'node:url';

import { getCommandMetadata, type CommandClass } from '@zeltjs/core';
import { glob } from 'tinyglobby';

export class GlobError extends Error {
  readonly type = 'GLOB_FAILED' as const;
  constructor(cause: unknown) {
    super('Failed to scan command files');
    this.name = 'GlobError';
    this.cause = cause;
  }
}

export class ImportError extends Error {
  readonly type = 'IMPORT_FAILED' as const;
  readonly file: string;
  constructor(file: string, cause: unknown) {
    super(`Failed to import command file: ${file}`);
    this.name = 'ImportError';
    this.file = file;
    this.cause = cause;
  }
}

export type LoadCommandsError = GlobError | ImportError;

const importModule = async (file: string): Promise<Record<string, unknown>> => {
  try {
    return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  } catch (cause) {
    throw new ImportError(file, cause);
  }
};

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

const importAndExtract = async (
  file: string,
  commandMap: Map<string, CommandClass>,
): Promise<void> => {
  const module = await importModule(file);
  for (const [name, cls] of extractCommands(module)) {
    commandMap.set(name, cls);
  }
};

export const loadCommands = async (
  cwd: string,
  pattern: string,
): Promise<Map<string, CommandClass>> => {
  let files: string[];
  try {
    files = await glob(pattern, { cwd, absolute: true });
  } catch (cause) {
    throw new GlobError(cause);
  }

  const commandMap = new Map<string, CommandClass>();
  for (const file of files) {
    await importAndExtract(file, commandMap);
  }
  return commandMap;
};
