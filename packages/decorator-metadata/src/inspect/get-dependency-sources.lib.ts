import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { ResultAsync } from 'neverthrow';
import { errAsync, ResultAsync as ResultAsyncCtor } from 'neverthrow';
import type { ImportRef } from './ast.lib';
import { buildImportMap, findClassByName } from './ast.lib';
import { getClassSource, packageFromPath, resolveClassSource } from './class-source.lib';
import type {
  ClassSource,
  DependencySource,
  GetDependenciesOptions,
  InspectError,
} from './inspect.types';
import type { CachedProgram, ProgramCacheError } from './program-cache.lib';
import { getOrCreateProgram } from './program-cache.lib';

type TypeScriptModule = typeof import('typescript');
type TSSourceFile = import('typescript').SourceFile;
type TSClassDeclaration = import('typescript').ClassDeclaration;

const DEFAULT_TSCONFIG = './tsconfig.json';

// `export { Local as Public }` の対応表 (export 名 → ローカル名 / ローカル名 → export 名)
type ExportAliasMaps = {
  readonly byExport: Map<string, string>;
  readonly byLocal: Map<string, string>;
};

export const buildExportAliasMaps = (
  sourceFile: TSSourceFile,
  ts: TypeScriptModule,
): ExportAliasMaps => {
  const byExport = new Map<string, string>();
  const byLocal = new Map<string, string>();
  for (const stmt of sourceFile.statements) {
    if (!ts.isExportDeclaration(stmt) || stmt.moduleSpecifier !== undefined) continue;
    const clause = stmt.exportClause;
    if (!clause || !ts.isNamedExports(clause)) continue;
    for (const element of clause.elements) {
      const local = element.propertyName?.text ?? element.name.text;
      byExport.set(element.name.text, local);
      byLocal.set(local, element.name.text);
    }
  }
  return { byExport, byLocal };
};

const hasModifier = (decl: TSClassDeclaration, kind: import('typescript').SyntaxKind): boolean =>
  decl.modifiers?.some((m) => m.kind === kind) ?? false;

const findDefaultExportedClass = (
  sourceFile: TSSourceFile,
  ts: TypeScriptModule,
): TSClassDeclaration | undefined => {
  for (const stmt of sourceFile.statements) {
    if (
      ts.isClassDeclaration(stmt) &&
      hasModifier(stmt, ts.SyntaxKind.ExportKeyword) &&
      hasModifier(stmt, ts.SyntaxKind.DefaultKeyword)
    ) {
      return stmt;
    }
  }
  return undefined;
};

const findClassByExportName = (
  sourceFile: TSSourceFile,
  exportName: string,
  aliases: ExportAliasMaps,
  ts: TypeScriptModule,
): TSClassDeclaration | undefined => {
  // `export { X as default }` は byExport に登録されるが ExportKeyword/DefaultKeyword
  // 修飾子を持たないため、修飾子ベースの findDefaultExportedClass より先に alias map を見る
  const aliasedLocal = aliases.byExport.get(exportName);
  if (aliasedLocal !== undefined) return findClassByName(sourceFile, aliasedLocal, ts);
  if (exportName === 'default') return findDefaultExportedClass(sourceFile, ts);
  return findClassByName(sourceFile, exportName, ts);
};

// 同一ファイル内クラスの export 名。export されていなければ undefined
export const exportNameOfLocalClass = (
  sourceFile: TSSourceFile,
  localName: string,
  aliases: ExportAliasMaps,
  ts: TypeScriptModule,
): string | undefined => {
  const aliased = aliases.byLocal.get(localName);
  if (aliased !== undefined) return aliased;
  const decl = findClassByName(sourceFile, localName, ts);
  if (!decl || !hasModifier(decl, ts.SyntaxKind.ExportKeyword)) return undefined;
  return hasModifier(decl, ts.SyntaxKind.DefaultKeyword) ? 'default' : localName;
};

const collectInjectLocalNames = (
  classNode: TSClassDeclaration,
  ts: TypeScriptModule,
): readonly { readonly localName: string; readonly line: number }[] => {
  const ctor = classNode.members.find((m) => ts.isConstructorDeclaration(m));
  if (!ctor || !ts.isConstructorDeclaration(ctor)) return [];
  const sourceFile = classNode.getSourceFile();
  return ctor.parameters.flatMap((param) => {
    if (!param.initializer || !ts.isCallExpression(param.initializer)) return [];
    const callee = param.initializer.expression;
    if (!ts.isIdentifier(callee) || callee.text !== 'inject') return [];
    const arg = param.initializer.arguments[0];
    if (!arg || !ts.isIdentifier(arg)) return [];
    const line =
      sourceFile.getLineAndCharacterOfPosition(param.initializer.getStart(sourceFile)).line + 1;
    return [{ localName: arg.text, line }];
  });
};

// TS の相対 specifier は拡張子省略・`.js` 書き (ESM 流儀) の両方があり得るため候補を試す
const relativeCandidates = (base: string): readonly string[] => [
  base,
  `${base}.ts`,
  `${base}.tsx`,
  `${base}.mts`,
  ...(base.endsWith('.js') ? [base.replace(/\.js$/, '.ts')] : []),
  `${base}/index.ts`,
];

const resolveSpecifierPath = (specifier: string, importerPath: string): string | undefined => {
  if (specifier.startsWith('.')) {
    const base = resolve(dirname(importerPath), specifier);
    return relativeCandidates(base).find((candidate) => existsSync(candidate));
  }
  // bare specifier は実行時 (ESM loader) と同じ条件で解決しないと、dual package で
  // 別インスタンス (CJS 側) に割れて ClassSource の同一性が壊れる
  const parentUrl = pathToFileURL(importerPath).href;
  try {
    return fileURLToPath(import.meta.resolve(specifier, parentUrl));
  } catch {
    try {
      return createRequire(importerPath).resolve(specifier);
    } catch {
      return undefined;
    }
  }
};

/** module の export 名から、alias を辿った先にある class 宣言を引く */
const declaredClassOf = (
  cached: CachedProgram,
  source: ClassSource,
): TSClassDeclaration | undefined => {
  const { program, ts } = cached;
  const sourceFile = program.getSourceFile(source.filePath);
  if (!sourceFile) return undefined;
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return undefined;
  const exported = checker
    .getExportsOfModule(moduleSymbol)
    .find((symbol) => symbol.name === source.exportName);
  if (!exported) return undefined;
  // `export *` で運ばれた symbol は alias ではなく実体そのものなので、そのまま宣言を見る
  const target =
    (exported.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(exported) : exported;
  return target.declarations?.find((node) => ts.isClassDeclaration(node));
};

/**
 * re-export だけを書いた barrel(`export { X } from './y'`・`export { X as Y } from './y'`・
 * `export * from './y'`、およびそれを重ねた多段)を checker の alias 解決で辿り、
 * 宣言が実在するファイルとそのファイルでの export 名へ降ろす。
 *
 * 実行時の正準化(resolveClassSource→getClassSource)は decorator metadata を持つクラスに
 * しか効かないため、未デコレートのクラスは barrel のまま残る。barrel には宣言が無く、
 * 宣言を探す側(getClassDeclarations・findClassByExportName)はそこで必ず失敗する。
 */
const aliasResolved = (cached: CachedProgram, raw: ClassSource): ClassSource => {
  const declaration = declaredClassOf(cached, raw);
  if (declaration?.name === undefined) return raw;
  const declaringFile = declaration.getSourceFile();
  // .d.ts は宣言だけで constructor の inject() を持たないため、型定義へは降ろさない
  if (declaringFile.fileName === raw.filePath || declaringFile.isDeclarationFile) return raw;
  const exportName = exportNameOfLocalClass(
    declaringFile,
    declaration.name.text,
    buildExportAliasMaps(declaringFile, cached.ts),
    cached.ts,
  );
  return exportName === undefined ? raw : { filePath: declaringFile.fileName, exportName };
};

// 実クラス経由で ClassSource を正準化する。エントリ/チャンクのパス差や re-export の
// 名前差があっても、クラスオブジェクトの trace 由来の値に収束させる。
// 正準化に失敗した場合 (未デコレートのクラス等) は解決済みの raw 値をそのまま使う
//
// team-lead 決定(Task 10 remaining-diff cause 5): raw.filePath が external(node_modules
// 配下)なら、この正準化を行わず raw をそのまま使う。正準化は resolveClassSource→getClassSource
// の往復でクラスオブジェクトを実際に動的 import し、その「宣言ファイルの実体」から exportName を
// 再導出するが、外部パッケージが tsdown/rolldown でバンドルされた dist を配布している場合、
// その再導出はバンドラが生成した chunk 内部の一時変数名(例: `t`)を拾ってしまうことがある
// (@zeltjs/kv が MemoryKVAdaptor を複数の名前で re-export する場合の実例)。external の
// 場合、rule(a)(import map)から得た raw の exportName(呼び出し元ファイルの import 文に
// 実際に書かれている名前)がユーザー向けの安定した唯一の名前であり、これ以上正準化する
// 必要も利点も無い(ExternalNode の id は filePath ではなく (package, member) だけで
// 決まるため、chunk のパス差を吸収する目的の正準化はそもそも external には無関係)。
// internal なターゲットは既存どおり正準化する(バレル再エクスポート越しの別名を1つの
// ClassNode に収束させるために必要)
const canonicalize = async (
  cached: CachedProgram,
  localName: string,
  raw: ClassSource,
  line: number,
): Promise<DependencySource> => {
  if (packageFromPath(raw.filePath) !== undefined) {
    return { kind: 'class', localName, source: raw, line };
  }
  const declared = aliasResolved(cached, raw);
  const cls = await resolveClassSource(declared);
  if (cls.isErr()) {
    return { kind: 'unresolved', localName, reason: cls.error.message };
  }
  const canonical = await getClassSource(cls.value);
  return {
    kind: 'class',
    localName,
    source: canonical.isOk() ? canonical.value : declared,
    line,
  };
};

const toDependencySource = async (
  cached: CachedProgram,
  localName: string,
  line: number,
  sourceFile: TSSourceFile,
  importMap: Map<string, ImportRef>,
  aliases: ExportAliasMaps,
  ts: TypeScriptModule,
): Promise<DependencySource> => {
  const importRef = importMap.get(localName);
  if (importRef) {
    const filePath = resolveSpecifierPath(importRef.specifier, sourceFile.fileName);
    if (filePath === undefined) {
      return {
        kind: 'unresolved',
        localName,
        reason: `Cannot resolve module specifier '${importRef.specifier}' from ${sourceFile.fileName}`,
      };
    }
    return canonicalize(cached, localName, { filePath, exportName: importRef.exportName }, line);
  }
  const exportName = exportNameOfLocalClass(sourceFile, localName, aliases, ts);
  if (exportName === undefined) {
    return {
      kind: 'unresolved',
      localName,
      reason: `Class ${localName} in ${sourceFile.fileName} is not exported`,
    };
  }
  return canonicalize(cached, localName, { filePath: sourceFile.fileName, exportName }, line);
};

const extract = (
  cached: CachedProgram,
  requested: ClassSource,
): ResultAsync<readonly DependencySource[], InspectError> => {
  const { program, ts } = cached;
  if (!program.getSourceFile(requested.filePath)) {
    return errAsync({
      code: 'SOURCE_NOT_FOUND',
      message: `Source file not found: ${requested.filePath}`,
    });
  }
  // 依頼された所在が barrel でも、宣言のあるファイルで constructor を読む
  const source = aliasResolved(cached, requested);
  const sourceFile = program.getSourceFile(source.filePath);
  if (!sourceFile) {
    return errAsync({
      code: 'SOURCE_NOT_FOUND',
      message: `Source file not found: ${source.filePath}`,
    });
  }
  const aliases = buildExportAliasMaps(sourceFile, ts);
  const classNode = findClassByExportName(sourceFile, source.exportName, aliases, ts);
  if (!classNode) {
    return errAsync({
      code: 'POSITION_INVALID',
      message: `No class exported as ${source.exportName} in ${source.filePath}`,
    });
  }
  const importMap = buildImportMap(sourceFile, ts);
  const injectRefs = collectInjectLocalNames(classNode, ts);
  return ResultAsyncCtor.fromSafePromise(
    Promise.all(
      injectRefs.map(({ localName, line }) =>
        toDependencySource(cached, localName, line, sourceFile, importMap, aliases, ts),
      ),
    ),
  );
};

/** @throws {UnsupportedTypeScriptVersionError} from resolve-typescript.lib.ts:resolveTypeScript */
export const getDependencySources = (
  source: ClassSource,
  options?: GetDependenciesOptions,
): ResultAsync<readonly DependencySource[], InspectError | ProgramCacheError> => {
  const tsconfigPath = resolve(options?.tsconfig ?? DEFAULT_TSCONFIG);
  return getOrCreateProgram(tsconfigPath).andThen((cached) => extract(cached, source));
};
