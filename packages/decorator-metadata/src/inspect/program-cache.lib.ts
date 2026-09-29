import { errAsync, okAsync, ResultAsync } from 'neverthrow';

import { resolveTypeScript } from './resolve-typescript.lib';

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

  const configDir = tsconfigPath.replace(/[^/\\]+$/, '');
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, configDir);

  // レビュー指摘1: parseJsonConfigFileContent は compilerOptions の不正値(存在しない
  // target/module 名等)を例外ではなく errors 配列に積むだけで返す。ここで無視すると
  // 壊れた既定値の Program が黙って作られ、以降の全 inspect 呼び出しが原因不明な形で
  // 失敗する。ts.formatDiagnostics で人間可読なメッセージに整形して fail する
  if (parsedConfig.errors.length > 0) {
    return errAsync({
      code: 'TSCONFIG_ERROR',
      message: ts.formatDiagnostics(parsedConfig.errors, {
        getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
        getCanonicalFileName: (f) => f,
        getNewLine: () => ts.sys.newLine,
      }),
    });
  }

  // レビュー指摘(node:crypto 等の @types/node 解決が呼び出し元プロセスの cwd に依存していた
  // バグの修正): host を渡さない ts.createProgram は既定の CompilerHost を使い、その
  // getCurrentDirectory は ts.sys.getCurrentDirectory()(= process.cwd())を返す。typeRoots
  // 省略時の既定探索(getDefaultTypeRoots)は currentDirectory から上方向に node_modules/@types
  // を探すため、呼び出し元プロセスの cwd が tsconfig のあるディレクトリ(pnpm の isolated
  // node_modules では node_modules/@types はここにしか無い)と異なると @types/node が
  // 見つからず、'node:crypto' 等の組み込みモジュールが symbol-unresolved になっていた。
  // tsconfig 自身のディレクトリを返す host に差し替え、呼び出し元の cwd から独立させる
  const host = ts.createCompilerHost(parsedConfig.options);
  host.getCurrentDirectory = () => configDir;

  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
    host,
  });

  const checker = program.getTypeChecker();
  return okAsync({ program, checker, ts });
};

/** @throws {UnsupportedTypeScriptVersionError} */
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
  if (tsconfigPath === undefined) {
    cache.clear();
    return;
  }
  cache.delete(tsconfigPath);
};
