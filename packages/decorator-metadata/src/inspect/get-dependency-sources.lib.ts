import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { ResultAsync } from 'neverthrow';
import { errAsync, ResultAsync as ResultAsyncCtor } from 'neverthrow';

import { findClassByName } from './ast.lib';
import { getClassSource, resolveClassSource } from './class-source.lib';
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

// ローカル名 → import 元 (specifier + export 名)
type ImportRef = { readonly specifier: string; readonly exportName: string };

const addNamedImports = (
  map: Map<string, ImportRef>,
  clause: import('typescript').ImportClause,
  specifier: string,
  ts: TypeScriptModule,
): void => {
  const bindings = clause.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return;
  for (const element of bindings.elements) {
    map.set(element.name.text, {
      specifier,
      exportName: element.propertyName?.text ?? element.name.text,
    });
  }
};

const buildImportMap = (sourceFile: TSSourceFile, ts: TypeScriptModule): Map<string, ImportRef> => {
  const map = new Map<string, ImportRef>();
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const specifier = stmt.moduleSpecifier.text;
    const clause = stmt.importClause;
    if (!clause) continue;
    if (clause.name) map.set(clause.name.text, { specifier, exportName: 'default' });
    addNamedImports(map, clause, specifier, ts);
  }
  return map;
};

// `export { Local as Public }` の対応表 (export 名 → ローカル名 / ローカル名 → export 名)
type ExportAliasMaps = {
  readonly byExport: Map<string, string>;
  readonly byLocal: Map<string, string>;
};

const buildExportAliasMaps = (sourceFile: TSSourceFile, ts: TypeScriptModule): ExportAliasMaps => {
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
  if (exportName === 'default') return findDefaultExportedClass(sourceFile, ts);
  const localName = aliases.byExport.get(exportName) ?? exportName;
  return findClassByName(sourceFile, localName, ts);
};

// 同一ファイル内クラスの export 名。export されていなければ undefined
const exportNameOfLocalClass = (
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
): readonly string[] => {
  const ctor = classNode.members.find((m) => ts.isConstructorDeclaration(m));
  if (!ctor || !ts.isConstructorDeclaration(ctor)) return [];
  return ctor.parameters.flatMap((param) => {
    if (!param.initializer || !ts.isCallExpression(param.initializer)) return [];
    const callee = param.initializer.expression;
    if (!ts.isIdentifier(callee) || callee.text !== 'inject') return [];
    const arg = param.initializer.arguments[0];
    return arg && ts.isIdentifier(arg) ? [arg.text] : [];
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

// 実クラス経由で ClassSource を正準化する。エントリ/チャンクのパス差や re-export の
// 名前差があっても、クラスオブジェクトの trace 由来の値に収束させる。
// 正準化に失敗した場合 (未デコレートのクラス等) は解決済みの raw 値をそのまま使う
const canonicalize = async (localName: string, raw: ClassSource): Promise<DependencySource> => {
  const cls = await resolveClassSource(raw);
  if (cls.isErr()) {
    return { kind: 'unresolved', localName, reason: cls.error.message };
  }
  const canonical = await getClassSource(cls.value);
  return {
    kind: 'class',
    localName,
    source: canonical.isOk() ? canonical.value : raw,
  };
};

const toDependencySource = async (
  localName: string,
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
    return canonicalize(localName, { filePath, exportName: importRef.exportName });
  }
  const exportName = exportNameOfLocalClass(sourceFile, localName, aliases, ts);
  if (exportName === undefined) {
    return {
      kind: 'unresolved',
      localName,
      reason: `Class ${localName} in ${sourceFile.fileName} is not exported`,
    };
  }
  return canonicalize(localName, { filePath: sourceFile.fileName, exportName });
};

const extract = (
  cached: CachedProgram,
  source: ClassSource,
): ResultAsync<readonly DependencySource[], InspectError> => {
  const { program, ts } = cached;
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
  const localNames = collectInjectLocalNames(classNode, ts);
  return ResultAsyncCtor.fromSafePromise(
    Promise.all(
      localNames.map((name) => toDependencySource(name, sourceFile, importMap, aliases, ts)),
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
