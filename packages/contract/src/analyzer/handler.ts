// packages/contract/src/analyzer/handler.ts
import { type CallExpression, type MethodDeclaration, Node, SyntaxKind } from 'ts-morph';
import { ok, err, type Result } from 'neverthrow';

import type { AnalyzerError } from '../errors';

export type ValidationTarget = 'json' | 'form';

export type RequestSchemaRef =
  | {
      kind: 'valibot-named';
      readonly module: string;
      readonly exportName: string;
      readonly target: ValidationTarget;
    }
  | { kind: 'valibot-inline'; readonly schemaText: string; readonly target: ValidationTarget }
  | { kind: 'none' };

export type HandlerSignatureInfo = {
  readonly requestSchema: RequestSchemaRef;
  readonly pathParams: readonly string[];
};

const isCallTo = (expr: CallExpression, name: string): boolean =>
  expr.getExpression().getText() === name;

const literalArg = (expr: CallExpression): string | undefined => {
  const arg = expr.getArguments()[0];
  if (!arg) return undefined;
  if (arg.getKind() !== SyntaxKind.StringLiteral) return undefined;
  return arg.getText().slice(1, -1);
};

const identifierArg = (expr: CallExpression): { exportName: string } | undefined => {
  const arg = expr.getArguments()[0];
  if (!arg) return undefined;
  if (arg.getKind() !== SyntaxKind.Identifier) return undefined;
  return { exportName: arg.getText() };
};

const resolveSchemaModule = (expr: CallExpression, exportName: string): string | undefined => {
  const sourceFile = expr.getSourceFile();
  for (const imp of sourceFile.getImportDeclarations()) {
    for (const named of imp.getNamedImports()) {
      if (named.getName() === exportName) {
        const sf = imp.getModuleSpecifierSourceFile();
        return sf?.getFilePath();
      }
    }
  }
  for (const exp of sourceFile.getExportedDeclarations().get(exportName) ?? []) {
    return exp.getSourceFile().getFilePath();
  }
  return undefined;
};

const extractTarget = (expr: CallExpression): ValidationTarget => {
  const args = expr.getArguments();
  const targetArg = args[1];
  if (!targetArg) return 'json';
  const text = targetArg.getText();
  if (text === "'form'" || text === '"form"') return 'form';
  return 'json';
};

const analyzeValidatedCall = (expr: CallExpression): Result<RequestSchemaRef, AnalyzerError> => {
  const target = extractTarget(expr);
  const id = identifierArg(expr);
  if (id) {
    const module = resolveSchemaModule(expr, id.exportName);
    if (module === undefined) {
      return err({ type: 'MODULE_RESOLVE_FAILED', exportName: id.exportName });
    }
    return ok({ kind: 'valibot-named', module, exportName: id.exportName, target });
  }
  const arg = expr.getArguments()[0];
  return ok({ kind: 'valibot-inline', schemaText: arg?.getText() ?? '', target });
};

const processValidatedParam = (init: CallExpression): Result<RequestSchemaRef, AnalyzerError> => {
  const result = analyzeValidatedCall(init);
  if (result.isErr()) return err(result.error);
  return ok(result.value);
};

const processPathParamParam = (init: CallExpression): Result<string, AnalyzerError> => {
  const name = literalArg(init);
  if (name === undefined) {
    return err({ type: 'PATH_PARAM_REQUIRES_LITERAL' });
  }
  return ok(name);
};

// eslint-disable-next-line complexity
export const analyzeHandlerSignature = (
  m: MethodDeclaration,
): Result<HandlerSignatureInfo, AnalyzerError> => {
  let requestSchema: RequestSchemaRef = { kind: 'none' };
  const pathParams: string[] = [];

  for (const param of m.getParameters()) {
    const init = param.getInitializer();
    if (!init || !Node.isCallExpression(init)) continue;

    if (isCallTo(init, 'validated')) {
      const result = processValidatedParam(init);
      if (result.isErr()) return err(result.error);
      requestSchema = result.value;
      continue;
    }
    if (isCallTo(init, 'pathParam')) {
      const result = processPathParamParam(init);
      if (result.isErr()) return err(result.error);
      pathParams.push(result.value);
    }
  }

  return ok({ requestSchema, pathParams });
};
