import ts from 'typescript';
import type { Diagnostic, Evidence, Feature, Material, PluginResult } from '../core';
import type { LibraryAnchors, LibraryInput } from './library.lib';
import {
  appFilesOf,
  evidenceOf,
  libraryAnchorsOf,
  libraryReports,
  readRelationMeanings,
  resolvedSymbolAt,
  stringLiteralOf,
} from './library.lib';

export const DRIZZLE_PROVIDER = 'drizzle';

export const DRIZZLE_FEATURES: readonly Feature[] = ['meanings', 'hints'];

const PACKAGE = 'drizzle-orm';

/** table builder の戻り型がこの base 型に由来するかで table を決める(付録E) */
const BASE_EXPORTS = ['Table'];

const INFERRED_TYPE_MEMBERS = ['$inferSelect', '$inferInsert'];

const INFERRED_TYPE_LABEL = 'DB schema由来';

type Context = {
  readonly input: LibraryInput;
  readonly anchors: LibraryAnchors;
};

const topLevelVariables = (file: ts.SourceFile): readonly ts.VariableDeclaration[] =>
  file.statements.flatMap((statement) =>
    ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [],
  );

/** `sqliteTable('users', …)` のように drizzle の export を呼び、戻り型が Table 由来の宣言 */
const tableCallOf = (
  ctx: Context,
  declaration: ts.VariableDeclaration,
): ts.CallExpression | null => {
  const initializer = declaration.initializer;
  if (initializer === undefined || !ts.isCallExpression(initializer)) return null;
  if (ctx.anchors.exportNameOf(initializer.expression) === null) return null;
  const derived = ctx.anchors.derivesFromBase(
    ctx.input.checker.getTypeAtLocation(declaration.name),
  );
  return derived ? initializer : null;
};

/** `typeof users.$inferSelect` のように Table の member から作った type */
const inferredTypeHints = (ctx: Context, file: ts.SourceFile): readonly Material[] =>
  file.statements.flatMap((statement) => {
    if (!ts.isTypeAliasDeclaration(statement)) return [];
    const type = statement.type;
    if (!ts.isTypeQueryNode(type)) return [];
    const symbol = resolvedSymbolAt(ctx.input.checker, type.exprName);
    if (symbol === undefined || !INFERRED_TYPE_MEMBERS.includes(symbol.name)) return [];
    if (!ctx.anchors.isBaseMember(symbol)) return [];
    const subject = ctx.input.resolver.subjectOf(statement);
    if (subject === null) return [];
    return [
      {
        kind: 'hint' as const,
        subject,
        label: INFERRED_TYPE_LABEL,
        evidence: evidenceOf(DRIZZLE_PROVIDER, ctx.input.resolver.spanOf(type)),
      },
    ];
  });

type TableScan = {
  readonly materials: Material[];
  readonly diagnostics: Diagnostic[];
  readonly tables: Map<string, Evidence['span']>;
};

const emptyScan = (): TableScan => ({ materials: [], diagnostics: [], tables: new Map() });

const baseUnresolvedDiagnostics = (anchors: LibraryAnchors): readonly Diagnostic[] =>
  anchors.imported && !anchors.baseResolved
    ? [
        {
          code: 'drizzle-base-unresolved',
          message: `${BASE_EXPORTS.join(' / ')} not found in ${PACKAGE}`,
          subject: null,
          spans: [],
        },
      ]
    : [];

const addTableNameHint = (
  ctx: Context,
  scan: TableScan,
  subject: string,
  call: ts.CallExpression,
): void => {
  const name = stringLiteralOf(call.arguments[0]);
  if (name === null) {
    scan.diagnostics.push({
      code: 'drizzle-table-name-dynamic',
      message: 'table name is not a literal',
      subject,
      spans: [ctx.input.resolver.spanOf(call)],
    });
    return;
  }
  scan.materials.push({
    kind: 'hint',
    subject,
    label: name,
    evidence: evidenceOf(DRIZZLE_PROVIDER, ctx.input.resolver.spanOf(call.arguments[0] ?? call)),
  });
};

const scanTables = (ctx: Context, file: ts.SourceFile, scan: TableScan): void => {
  for (const declaration of topLevelVariables(file)) {
    const call = tableCallOf(ctx, declaration);
    if (call === null) continue;
    const subject = ctx.input.resolver.subjectOf(declaration);
    if (subject === null) continue;
    const span = ctx.input.resolver.spanOf(declaration.name);
    scan.tables.set(subject, span);
    scan.materials.push({
      kind: 'meaning',
      subject,
      meaning: 'table',
      evidence: evidenceOf(DRIZZLE_PROVIDER, span),
    });
    addTableNameHint(ctx, scan, subject, call);
  }
};

const scanFiles = (ctx: Context, files: readonly ts.SourceFile[]): TableScan => {
  const scan = emptyScan();
  for (const file of files) {
    scanTables(ctx, file, scan);
    scan.materials.push(...inferredTypeHints(ctx, file));
  }
  scan.materials.push(
    ...readRelationMeanings({
      resolver: ctx.input.resolver,
      provider: DRIZZLE_PROVIDER,
      meaning: 'table',
      subjects: scan.tables,
    }),
  );
  return scan;
};

/**
 * drizzle の table を、定義元の Symbol で確かめた宣言とそれを読む線にだけ意味として付ける。
 * コアの事実は書き換えない(4.4)。
 */
export const analyzeDrizzle = (input: LibraryInput): PluginResult => {
  const files = appFilesOf(input);
  const anchors = libraryAnchorsOf({
    program: input.program,
    checker: input.checker,
    files,
    packageName: PACKAGE,
    baseExports: BASE_EXPORTS,
  });
  const ctx: Context = { input, anchors };
  const scan = anchors.baseResolved ? scanFiles(ctx, files) : emptyScan();

  return {
    revision: input.revision,
    materials: scan.materials,
    reports: libraryReports({
      provider: DRIZZLE_PROVIDER,
      features: DRIZZLE_FEATURES,
      config: input.config,
      inspectedFiles: files.map((file) => input.resolver.relativePath(file.fileName)).sort(),
      diagnostics: [...baseUnresolvedDiagnostics(anchors), ...scan.diagnostics],
    }),
    ignoreRecommendations: [],
  };
};
