import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import { resolveTypeScript } from './resolve-typescript';

type TypeScriptModule = typeof import('typescript');

export type CachedProgram = {
  readonly program: import('typescript').Program;
  readonly checker: import('typescript').TypeChecker;
  readonly ts: TypeScriptModule;
};

export type ProgramCacheError = {
  code: 'TSCONFIG_ERROR';
  readonly message: string;
};

const cache = new Map<string, CachedProgram>();

const createProgramResult = (
  tsconfigPath: string,
  ts: TypeScriptModule,
): ResultAsync<CachedProgram, ProgramCacheError> => {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    return errAsync({
      code: 'TSCONFIG_ERROR',
      message: `Failed to read tsconfig: ${tsconfigPath}`,
    });
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    tsconfigPath.replace(/[^/\\]+$/, ''),
  );

  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });

  const checker = program.getTypeChecker();
  return okAsync({ program, checker, ts });
};

export const getOrCreateProgram = (
  tsconfigPath: string,
): ResultAsync<CachedProgram, ProgramCacheError> => {
  const cached = cache.get(tsconfigPath);
  if (cached) return okAsync(cached);

  return ResultAsync.fromSafePromise(resolveTypeScript())
    .andThen((ts) => createProgramResult(tsconfigPath, ts))
    .map((result) => {
      cache.set(tsconfigPath, result);
      return result;
    });
};

export const clearProgramCache = (tsconfigPath?: string): void => {
  if (tsconfigPath) {
    cache.delete(tsconfigPath);
  } else {
    cache.clear();
  }
};
