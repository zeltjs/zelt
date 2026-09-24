import ts from 'typescript';
import type { Diagnostic, Evidence, Feature, Material, PluginResult } from '../core';
import type { LibraryAnchors, LibraryInput } from './library.lib';
import {
  appFilesOf,
  evidenceOf,
  libraryAnchorsOf,
  libraryReports,
  readRelationMeanings,
} from './library.lib';

export const VALIBOT_PROVIDER = 'valibot';

export const VALIBOT_FEATURES: readonly Feature[] = ['meanings', 'hints'];

const PACKAGE = 'valibot';

/** schema かどうかは、戻り型がこの base 型に由来するかで決める。suffix では判定しない(付録E) */
const BASE_EXPORTS = ['BaseSchema', 'BaseSchemaAsync'];

const INFER_OUTPUT = 'InferOutput';

type Context = {
  readonly input: LibraryInput;
  readonly anchors: LibraryAnchors;
  readonly evidence: (node: ts.Node) => readonly Evidence[];
};

const topLevelVariables = (file: ts.SourceFile): readonly ts.VariableDeclaration[] =>
  file.statements.flatMap((statement) =>
    ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [],
  );

/** `v.object(...)` のように valibot の export を呼び、戻り型が BaseSchema 由来の宣言 */
const isSchemaDeclaration = (ctx: Context, declaration: ts.VariableDeclaration): boolean => {
  const initializer = declaration.initializer;
  if (initializer === undefined || !ts.isCallExpression(initializer)) return false;
  if (ctx.anchors.exportNameOf(initializer.expression) === null) return false;
  return ctx.anchors.derivesFromBase(ctx.input.checker.getTypeAtLocation(declaration.name));
};

/** `InferOutput<typeof X>` の X。type query でなければ書かれたままを使う */
const inferredSchemaName = (argument: ts.TypeNode): string =>
  ts.isTypeQueryNode(argument) ? argument.exprName.getText() : argument.getText();

const inferOutputHints = (ctx: Context, file: ts.SourceFile): readonly Material[] =>
  file.statements.flatMap((statement) => {
    if (!ts.isTypeAliasDeclaration(statement)) return [];
    const type = statement.type;
    if (!ts.isTypeReferenceNode(type)) return [];
    if (ctx.anchors.exportNameOf(type.typeName) !== INFER_OUTPUT) return [];
    const argument = (type.typeArguments ?? [])[0];
    const subject = ctx.input.resolver.subjectOf(statement);
    if (argument === undefined || subject === null) return [];
    return [
      {
        kind: 'hint' as const,
        subject,
        label: `${INFER_OUTPUT}<${inferredSchemaName(argument)}>`,
        evidence: ctx.evidence(type),
      },
    ];
  });

const baseUnresolvedDiagnostics = (anchors: LibraryAnchors): readonly Diagnostic[] =>
  anchors.imported && !anchors.baseResolved
    ? [
        {
          code: 'valibot-base-unresolved',
          message: `${BASE_EXPORTS.join(' / ')} not found in ${PACKAGE}`,
          subject: null,
          spans: [],
        },
      ]
    : [];

const schemaMeanings = (
  ctx: Context,
  file: ts.SourceFile,
  schemas: Map<string, Evidence['span']>,
): readonly Material[] => {
  const out: Material[] = [];
  for (const declaration of topLevelVariables(file)) {
    if (!isSchemaDeclaration(ctx, declaration)) continue;
    const subject = ctx.input.resolver.subjectOf(declaration);
    if (subject === null) continue;
    const span = ctx.input.resolver.spanOf(declaration.name);
    schemas.set(subject, span);
    out.push({
      kind: 'meaning',
      subject,
      meaning: 'schema',
      evidence: evidenceOf(VALIBOT_PROVIDER, span),
    });
  }
  return out;
};

const schemaMaterials = (ctx: Context, files: readonly ts.SourceFile[]): readonly Material[] => {
  const schemas = new Map<string, Evidence['span']>();
  const materials: Material[] = [];
  for (const file of files) {
    materials.push(...schemaMeanings(ctx, file, schemas));
    materials.push(...inferOutputHints(ctx, file));
  }
  materials.push(
    ...readRelationMeanings({
      resolver: ctx.input.resolver,
      provider: VALIBOT_PROVIDER,
      meaning: 'schema',
      subjects: schemas,
    }),
  );
  return materials;
};

/**
 * valibot の schema を、定義元の Symbol で確かめた宣言とそれを読む線にだけ意味として付ける。
 * コアの事実は書き換えない(4.4)。
 */
export const analyzeValibot = (input: LibraryInput): PluginResult => {
  const files = appFilesOf(input);
  const anchors = libraryAnchorsOf({
    program: input.program,
    checker: input.checker,
    files,
    packageName: PACKAGE,
    baseExports: BASE_EXPORTS,
  });
  const ctx: Context = {
    input,
    anchors,
    evidence: (node) => evidenceOf(VALIBOT_PROVIDER, input.resolver.spanOf(node)),
  };

  return {
    revision: input.revision,
    materials: anchors.baseResolved ? [...schemaMaterials(ctx, files)] : [],
    reports: libraryReports({
      provider: VALIBOT_PROVIDER,
      features: VALIBOT_FEATURES,
      config: input.config,
      inspectedFiles: files.map((file) => input.resolver.relativePath(file.fileName)).sort(),
      diagnostics: baseUnresolvedDiagnostics(anchors),
    }),
    ignoreRecommendations: [],
  };
};
