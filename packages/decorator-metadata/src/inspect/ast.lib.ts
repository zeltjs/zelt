type TypeScriptModule = typeof import('typescript');
type TSSourceFile = import('typescript').SourceFile;
type TSClassDeclaration = import('typescript').ClassDeclaration;
type TSNode = import('typescript').Node;

export const findClassAtPosition = (
  sourceFile: TSSourceFile,
  pos: number,
  ts: TypeScriptModule,
): TSClassDeclaration | undefined => {
  const find = (node: TSNode): TSClassDeclaration | undefined => {
    const childHit = ts.forEachChild(node, find);
    if (childHit) return childHit;
    if (ts.isClassDeclaration(node) && node.pos <= pos && pos < node.end) {
      return node;
    }
    return undefined;
  };
  return find(sourceFile);
};

export const findClassByName = (
  sourceFile: TSSourceFile,
  name: string,
  ts: TypeScriptModule,
): TSClassDeclaration | undefined => {
  const find = (node: TSNode): TSClassDeclaration | undefined => {
    if (ts.isClassDeclaration(node) && node.name !== undefined && node.name.text === name) {
      return node;
    }
    return ts.forEachChild(node, find);
  };
  return find(sourceFile);
};

type TSExpression = import('typescript').Expression;

// namespace import 経由 (`@ns.Controller()`) のデコレータは callee が
// PropertyAccessExpression になるため、Identifier に直接絞らず再帰的に辿る。
export const getDecoratorName = (expr: TSExpression, ts: TypeScriptModule): string | undefined => {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (ts.isCallExpression(expr)) return getDecoratorName(expr.expression, ts);
  return undefined;
};

export type ImportRef = { readonly specifier: string; readonly exportName: string };

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

// ローカル名 → import 元(specifier + export 名)。getDependencySources が inject() の
// 解決に使う
export const buildImportMap = (
  sourceFile: TSSourceFile,
  ts: TypeScriptModule,
): Map<string, ImportRef> => {
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
