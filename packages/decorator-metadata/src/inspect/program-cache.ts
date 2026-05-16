import { resolveTypeScript } from './resolve-typescript';

type TypeScriptModule = typeof import('typescript');

type CachedProgram = {
  readonly program: import('typescript').Program;
  readonly checker: import('typescript').TypeChecker;
  readonly ts: TypeScriptModule;
};

const cache = new Map<string, CachedProgram>();

export const getOrCreateProgram = async (tsconfigPath: string): Promise<CachedProgram> => {
  const cached = cache.get(tsconfigPath);
  if (cached) return cached;

  const ts = await resolveTypeScript();

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(`Failed to read tsconfig: ${tsconfigPath}`);
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
  const result: CachedProgram = { program, checker, ts };

  cache.set(tsconfigPath, result);
  return result;
};

export const clearProgramCache = (tsconfigPath?: string): void => {
  if (tsconfigPath) {
    cache.delete(tsconfigPath);
  } else {
    cache.clear();
  }
};
