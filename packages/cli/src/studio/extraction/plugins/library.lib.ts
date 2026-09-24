import ts from 'typescript';
import type {
  AnalysisReport,
  CoreResolver,
  Diagnostic,
  Evidence,
  Feature,
  Material,
  ProviderId,
  ResolvedConfig,
} from '../core';
import { relationIdOf } from '../core';

/** Library plugin は担当 package の意味を付けるだけなので、app 固有の設定を持たない */
export type LibraryInput = {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly config: ResolvedConfig;
  readonly resolver: CoreResolver;
  readonly revision: string;
};

export const resolvedSymbolAt = (checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined => {
  const symbol = checker.getSymbolAtLocation(node);
  if (symbol === undefined) return undefined;
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
};

export const stringLiteralOf = (node: ts.Node | undefined): string | null =>
  node !== undefined && ts.isStringLiteralLike(node) ? node.text : null;

export const appFilesOf = (input: LibraryInput): readonly ts.SourceFile[] =>
  input.program
    .getSourceFiles()
    .filter(
      (file) =>
        !file.isDeclarationFile &&
        input.config.isIncluded(input.resolver.relativePath(file.fileName)),
    );

const moduleSpecifierOf = (statement: ts.Statement): ts.StringLiteral | undefined => {
  if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return undefined;
  const specifier = statement.moduleSpecifier;
  return specifier !== undefined && ts.isStringLiteral(specifier) ? specifier : undefined;
};

const importedModuleSymbol = (
  program: ts.Program,
  checker: ts.TypeChecker,
  specifier: string,
): ts.Symbol | undefined => {
  for (const file of program.getSourceFiles()) {
    for (const statement of file.statements) {
      const literal = moduleSpecifierOf(statement);
      if (literal === undefined || literal.text !== specifier) continue;
      const symbol = checker.getSymbolAtLocation(literal);
      if (symbol !== undefined) return symbol;
    }
  }
  return undefined;
};

const resolvedModuleSymbol = (
  program: ts.Program,
  checker: ts.TypeChecker,
  specifier: string,
  from: string,
): ts.Symbol | undefined => {
  const resolved = ts.resolveModuleName(specifier, from, program.getCompilerOptions(), ts.sys);
  const fileName = resolved.resolvedModule?.resolvedFileName;
  const file = fileName === undefined ? undefined : program.getSourceFile(fileName);
  return file === undefined ? undefined : checker.getSymbolAtLocation(file);
};

/** package 名から module の symbol を引く。import 済みならその場所、無ければ TS と同じ解決規則 */
const moduleSymbolOf = (
  program: ts.Program,
  checker: ts.TypeChecker,
  specifier: string,
  from: string,
): ts.Symbol | undefined =>
  importedModuleSymbol(program, checker, specifier) ??
  resolvedModuleSymbol(program, checker, specifier, from);

export type LibraryAnchors = {
  /** その node が package のどの export に解決されるか。名前の見た目では判定しない(4.4) */
  readonly exportNameOf: (node: ts.Node) => string | null;
  /** 型の member が package の base 型に由来するか */
  readonly derivesFromBase: (type: ts.Type) => boolean;
  /** symbol が package の base 型の member か */
  readonly isBaseMember: (symbol: ts.Symbol | undefined) => boolean;
  /** app が package を import しているか */
  readonly imported: boolean;
  /** base 型の宣言を解決できたか。できなければ判別不能(付録E) */
  readonly baseResolved: boolean;
};

type ModuleLookup = {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly importedFrom: string;
};

const importedSpecifiers = (
  files: readonly ts.SourceFile[],
  packageName: string,
): { readonly specifiers: ReadonlySet<string>; readonly importedFrom: string | null } => {
  const specifiers = new Set<string>();
  let importedFrom: string | null = null;
  for (const file of files) {
    for (const statement of file.statements) {
      const literal = moduleSpecifierOf(statement);
      if (literal === undefined) continue;
      const text = literal.text;
      if (text !== packageName && !text.startsWith(`${packageName}/`)) continue;
      specifiers.add(text);
      importedFrom ??= file.fileName;
    }
  }
  return { specifiers, importedFrom };
};

const aliasedDeclarations = (
  checker: ts.TypeChecker,
  exported: ts.Symbol,
): readonly ts.Declaration[] => {
  const resolved =
    (exported.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(exported) : exported;
  return resolved.declarations ?? [];
};

const exportNamesOf = (
  lookup: ModuleLookup,
  specifiers: ReadonlySet<string>,
): Map<ts.Declaration, string> => {
  const exportNames = new Map<ts.Declaration, string>();
  for (const specifier of specifiers) {
    const moduleSymbol = moduleSymbolOf(
      lookup.program,
      lookup.checker,
      specifier,
      lookup.importedFrom,
    );
    if (moduleSymbol === undefined) continue;
    for (const exported of lookup.checker.getExportsOfModule(moduleSymbol)) {
      for (const declaration of aliasedDeclarations(lookup.checker, exported)) {
        exportNames.set(declaration, exported.name);
      }
    }
  }
  return exportNames;
};

const baseDeclarationsOf = (
  lookup: ModuleLookup,
  packageName: string,
  baseExports: readonly string[],
): Set<ts.Node> => {
  const bases = new Set<ts.Node>();
  const rootSymbol = moduleSymbolOf(
    lookup.program,
    lookup.checker,
    packageName,
    lookup.importedFrom,
  );
  const exports = rootSymbol === undefined ? [] : lookup.checker.getExportsOfModule(rootSymbol);
  for (const exported of exports) {
    if (!baseExports.includes(exported.name)) continue;
    for (const declaration of aliasedDeclarations(lookup.checker, exported)) bases.add(declaration);
  }
  return bases;
};

export const libraryAnchorsOf = (input: {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly files: readonly ts.SourceFile[];
  readonly packageName: string;
  /** 戻り型の由来を確かめる base 型の export 名 */
  readonly baseExports: readonly string[];
}): LibraryAnchors => {
  const { program, checker, files, packageName, baseExports } = input;
  const { specifiers, importedFrom } = importedSpecifiers(files, packageName);
  const lookup: ModuleLookup | null =
    importedFrom === null ? null : { program, checker, importedFrom };

  const exportNames =
    lookup === null ? new Map<ts.Declaration, string>() : exportNamesOf(lookup, specifiers);
  const bases =
    lookup === null ? new Set<ts.Node>() : baseDeclarationsOf(lookup, packageName, baseExports);

  const isBaseMember = (symbol: ts.Symbol | undefined): boolean =>
    (symbol?.declarations ?? []).some((declaration) => bases.has(declaration.parent));

  return {
    exportNameOf: (node) => {
      for (const declaration of resolvedSymbolAt(checker, node)?.declarations ?? []) {
        const name = exportNames.get(declaration);
        if (name !== undefined) return name;
      }
      return null;
    },
    derivesFromBase: (type) =>
      checker.getPropertiesOfType(type).some((property) => isBaseMember(property)),
    isBaseMember,
    imported: importedFrom !== null,
    baseResolved: bases.size > 0,
  };
};

export const evidenceOf = (provider: ProviderId, span: Evidence['span']): readonly Evidence[] => [
  { provider, span, basis: 'syntax' },
];

/**
 * 宣言に意味を付けたものを読むコアの `read` にも同じ意味を付ける(付録E)。
 * 線の種類は変えず、意味だけを足す(4.4)。
 */
export const readRelationMeanings = (input: {
  readonly resolver: CoreResolver;
  readonly provider: ProviderId;
  readonly meaning: string;
  /** 意味を付けた宣言の ID と、その根拠になる span */
  readonly subjects: ReadonlyMap<string, Evidence['span']>;
}): readonly Material[] =>
  input.resolver.facts().relations.flatMap((relation) => {
    const span = relation.kind === 'read' ? input.subjects.get(relation.to) : undefined;
    if (span === undefined) return [];
    return [
      {
        kind: 'meaning' as const,
        subject: relationIdOf(relation.ownerId, relation.to, relation.kind),
        meaning: input.meaning,
        evidence: evidenceOf(input.provider, span),
      },
    ];
  });

export const libraryReports = (input: {
  readonly provider: ProviderId;
  readonly features: readonly Feature[];
  readonly config: ResolvedConfig;
  readonly inspectedFiles: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}): readonly AnalysisReport[] =>
  input.features.map((feature) => ({
    id: `report:${JSON.stringify([input.provider, feature, 'source', input.config.raw.include])}`,
    provider: input.provider,
    feature,
    status: input.diagnostics.length > 0 ? 'partial' : 'complete-in-scope',
    scope: { files: input.config.raw.include, category: 'source' },
    inspectedFiles: input.inspectedFiles,
    diagnostics: input.diagnostics,
  }));
