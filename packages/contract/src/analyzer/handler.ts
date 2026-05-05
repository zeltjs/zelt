import { type CallExpression, type MethodDeclaration, Node, SyntaxKind } from 'ts-morph';

export type RequestSchemaRef =
  | { kind: 'valibot-named'; readonly module: string; readonly exportName: string }
  | { kind: 'valibot-inline'; readonly schemaText: string }
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

// validated(SchemaIdent) の SchemaIdent がどの module の named export を指すかを resolve する。
// import 経由なら module 元の SourceFile、同一 file の export なら自身の path を返す。
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

const analyzeValidatedCall = (expr: CallExpression): RequestSchemaRef => {
  const id = identifierArg(expr);
  if (id) {
    const module = resolveSchemaModule(expr, id.exportName);
    if (module === undefined) {
      throw new Error(
        `zelt/openapi: cannot resolve module for validated(${id.exportName}). Schema must be a module-level export.`,
      );
    }
    return { kind: 'valibot-named', module, exportName: id.exportName };
  }
  const arg = expr.getArguments()[0];
  return { kind: 'valibot-inline', schemaText: arg?.getText() ?? '' };
};

export const analyzeHandlerSignature = (m: MethodDeclaration): HandlerSignatureInfo => {
  let requestSchema: RequestSchemaRef = { kind: 'none' };
  const pathParams: string[] = [];

  for (const param of m.getParameters()) {
    const init = param.getInitializer();
    if (!init || !Node.isCallExpression(init)) continue;

    if (isCallTo(init, 'validated')) {
      requestSchema = analyzeValidatedCall(init);
      continue;
    }
    if (isCallTo(init, 'pathParam')) {
      const name = literalArg(init);
      if (name === undefined) {
        throw new Error(`zelt/openapi: pathParam() requires a string literal argument`);
      }
      pathParams.push(name);
    }
  }

  return { requestSchema, pathParams };
};
