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

// tsconfig の include はユーザーのアプリコードを対象にした設定であり、zelt.config.ts
// (プロジェクトルート直下に置かれることが多い) を含む保証はない。studio がそのために
// ユーザーへ tsconfig の変更を要求するのは筋が悪いため、include の結果に関わらず
// 呼び出し元が明示した追加ファイルを常に rootNames に含める(program-cache.lib.ts:
// getConfigAppFactoryRef.lib.ts が configPath をここに渡す)
const createProgramResult = (
  tsconfigPath: string,
  ts: TypeScriptModule,
  extraRootFiles: readonly string[],
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

  const rootNames = [...new Set([...parsedConfig.fileNames, ...extraRootFiles])];

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
    rootNames,
    options: parsedConfig.options,
    host,
  });

  const checker = program.getTypeChecker();
  return okAsync({ program, checker, ts });
};

// extraRootFiles はキャッシュキーに含める(同じ tsconfig でも「素の include のみ」と
// 「特定ファイルを追加した」の2つの Program は rootNames が異なる別物のため、片方の
// キャッシュをもう片方に誤って再利用してはならない)。区切り文字はパスに出現し得ない
// バイトである必要があるため NUL(U+0000)を使う。ソース上は生バイトではなくエスケープ
// シーケンス \\x00 として書く(生の NUL バイトをソースファイルに直接埋め込むと git が
// テキストファイルをバイナリと誤認する)
const cacheKeyFor = (tsconfigPath: string, extraRootFiles: readonly string[]): string =>
  extraRootFiles.length === 0
    ? tsconfigPath
    : `${tsconfigPath}\x00${[...extraRootFiles].sort().join('\x00')}`;

/** @throws {UnsupportedTypeScriptVersionError} */
export const getOrCreateProgram = (
  tsconfigPath: string,
  options?: { readonly extraRootFiles?: readonly string[] },
): ResultAsync<CachedProgram, ProgramCacheError> => {
  const extraRootFiles = options?.extraRootFiles ?? [];
  const cacheKey = cacheKeyFor(tsconfigPath, extraRootFiles);
  const cached = cache.get(cacheKey);
  if (cached) return okAsync(cached);

  return ResultAsync.fromSafePromise(resolveTypeScript())
    .andThen((ts) => createProgramResult(tsconfigPath, ts, extraRootFiles))
    .map((result) => {
      cache.set(cacheKey, result);
      return result;
    });
};

// レビュー指摘11: extraRootFiles ありでキャッシュされたエントリは `${tsconfigPath}\x00...`
// という鍵になる(cacheKeyFor 参照)ため、tsconfigPath の完全一致だけでは削除されず
// 残り続けていた。同じ tsconfig に対する「素の include のみ」「特定ファイル追加」の
// 両方のエントリを、この tsconfig を指定した clearProgramCache 呼び出しで一括して消す
export const clearProgramCache = (tsconfigPath?: string): void => {
  if (tsconfigPath === undefined) {
    cache.clear();
    return;
  }
  const prefix = `${tsconfigPath}\x00`;
  for (const key of cache.keys()) {
    if (key === tsconfigPath || key.startsWith(prefix)) cache.delete(key);
  }
};
