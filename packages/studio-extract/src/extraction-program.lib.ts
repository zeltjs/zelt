import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import ts from 'typescript';

import type { ResolvedConfig, Span } from './core';
import { compileGlobs } from './core';

const toPosix = (path: string): string => path.replaceAll('\\', '/');

const literalPrefix = (pattern: string): string => {
  const parts: string[] = [];
  for (const segment of pattern.split('/')) {
    if (/[*?[]/u.test(segment)) break;
    parts.push(segment);
  }
  return parts.join('/');
};

const walkDirectory = (dir: string, onFile: (file: string) => void): void => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.'))
      continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkDirectory(full, onFile);
    else onFile(full);
  }
};

const filesMatching = (
  root: string,
  patterns: readonly string[],
  matches: (relPath: string) => boolean,
): string[] => {
  const found = new Set<string>();
  for (const pattern of patterns) {
    const base = resolve(root, literalPrefix(pattern));
    const stat = statSync(base, { throwIfNoEntry: false });
    if (stat === undefined) continue;
    if (stat.isFile()) {
      found.add(toPosix(base));
      continue;
    }
    walkDirectory(base, (file) => {
      if (matches(toPosix(relative(root, file)))) found.add(toPosix(file));
    });
  }
  return [...found].sort();
};

export const listIncludedFiles = (config: ResolvedConfig): string[] =>
  filesMatching(config.root, config.raw.include, config.isIncluded);

/**
 * test は索引には入るが地図には出ないので(付録H)、config の test 範囲を Program の
 * rootNames に足す。地図の宣言は include / exclude のままで変わらない。
 */
export const listTestScopeFiles = (config: ResolvedConfig): string[] => {
  const patterns = config.raw.plugins.flatMap((plugin) =>
    plugin.id === 'vitest' || plugin.id === 'http-requests'
      ? plugin.scopes.flatMap((scope) => scope.files)
      : [],
  );
  if (patterns.length === 0) return [];
  return filesMatching(config.root, patterns, compileGlobs(patterns));
};

// sourceModules: package specifier を dist の型定義ではなくソースへ向ける(付録H)
const sourceModuleResolver =
  (
    config: ResolvedConfig,
    host: ts.CompilerHost,
  ): NonNullable<ts.CompilerHost['resolveModuleNameLiterals']> =>
  (literals, containingFile, _redirected, compilerOptions) =>
    literals.map((literal) => {
      const mapped = config.sourceModules[literal.text];
      if (mapped !== undefined) {
        return {
          resolvedModule: {
            resolvedFileName: toPosix(mapped),
            extension: ts.Extension.Ts,
            isExternalLibraryImport: false,
          },
        };
      }
      return ts.resolveModuleName(literal.text, containingFile, compilerOptions, host);
    });

const extractionOptions = (config: ResolvedConfig): ts.CompilerOptions => {
  const raw = ts.readConfigFile(config.tsconfig, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    raw.config ?? {},
    ts.sys,
    dirname(config.tsconfig),
    undefined,
    config.tsconfig,
  );
  // rootDir/outDir/composite/incremental の出力制約は解析には不要で、残すと program 生成が失敗する(付録J)
  const { outDir, rootDir, tsBuildInfoFile, ...inherited } = parsed.options;
  void outDir;
  void rootDir;
  void tsBuildInfoFile;
  return {
    ...inherited,
    noEmit: true,
    declaration: false,
    declarationMap: false,
    sourceMap: false,
    composite: false,
    incremental: false,
    skipLibCheck: true,
  };
};

export const createExtractionProgram = (
  config: ResolvedConfig,
  rootNames: string[],
): ts.Program => {
  const options = extractionOptions(config);
  const host = ts.createCompilerHost(options, true);
  host.resolveModuleNameLiterals = sourceModuleResolver(config, host);
  return ts.createProgram({ rootNames, options, host });
};

/** 付録J: 読んだソースから作る内部 revision。plugin の結果が同じ入力のものかを照合する */
export const revisionOf = (program: ts.Program): string => {
  const hash = createHash('sha256');
  for (const file of [...program.getSourceFiles()].sort((a, b) =>
    a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0,
  )) {
    if (file.isDeclarationFile) continue;
    hash.update(`${file.fileName}\u0000${file.text.length}\u0000`).update(file.text);
  }
  return hash.digest('hex');
};

export const spanReader =
  (program: ts.Program, root: string) =>
  (span: Span): string => {
    const file = program
      .getSourceFiles()
      .find((candidate) => toPosix(relative(root, candidate.fileName)) === span.filePath);
    return file === undefined ? '' : file.text.slice(span.start, span.end);
  };
