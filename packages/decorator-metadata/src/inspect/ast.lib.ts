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
type TSModifierLike = import('typescript').ModifierLike;
type TSTypeChecker = import('typescript').TypeChecker;

// Step 4 で inspect.types.ts に定義する DecoratorInfo/ClassSource と構造的に同じ形。
// ast.lib.ts は inspect.types.ts より先に編集されるため、ここでは import せず
// インライン型で定義する(TypeScript の構造的型付けにより、Step 4 の型と完全互換になる)
type LocalClassSource = { readonly filePath: string; readonly exportName: string };
type LocalDecoratorInfo = {
  readonly name: string;
  readonly line: number;
  readonly args: readonly LocalClassSource[];
};

// namespace import 経由 (`@ns.Controller()`) のデコレータは callee が
// PropertyAccessExpression になるため、Identifier に直接絞らず再帰的に辿る。
// getFunctionDeclarations (メソッドの decorator 抽出) と getDependencies
// (クラスの decorator 抽出) の双方が同じ解決規則を必要とするため共有する。
export const getDecoratorName = (expr: TSExpression, ts: TypeScriptModule): string | undefined => {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (ts.isCallExpression(expr)) return getDecoratorName(expr.expression, ts);
  return undefined;
};

// checker.getSymbolAtLocation の結果が import alias の場合、実体のシンボルまで辿る
// (get-call-sites.lib.ts:resolveAliasedSymbol と同じ理由。ここでは Task 1 が Task 4 より
// 先に存在するため、小さいユーティリティとして重複を許容する)
const resolveAliasedSymbol = (
  symbol: import('typescript').Symbol,
  checker: TSTypeChecker,
  ts: TypeScriptModule,
): import('typescript').Symbol =>
  (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;

// レビュー指摘8: decorator 引数は文字列比較ではなく TypeChecker で解決したクラスの
// ClassSource で比較する(import 別名対策)。識別子引数のうちクラス宣言に解決できたものだけを
// 返す(文字列リテラル・非クラス識別子は対象外。@UseMiddleware 以外の decorator の
// 非クラス引数を無理にエラーにはしない)
const decoratorArgs = (
  expr: TSExpression,
  checker: TSTypeChecker,
  ts: TypeScriptModule,
): readonly LocalClassSource[] => {
  if (!ts.isCallExpression(expr)) return [];
  const sources: LocalClassSource[] = [];
  for (const arg of expr.arguments) {
    if (!ts.isIdentifier(arg)) continue;
    const symbol = checker.getSymbolAtLocation(arg);
    if (symbol === undefined) continue;
    const decl = resolveAliasedSymbol(symbol, checker, ts).getDeclarations()?.[0];
    if (decl === undefined || !ts.isClassDeclaration(decl) || decl.name === undefined) continue;
    sources.push({ filePath: decl.getSourceFile().fileName, exportName: decl.name.text });
  }
  return sources;
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

// ローカル名 → import 元(specifier + export 名)。getDependencySources(inject() の
// 解決)と getCallSites(裸呼び出し/new/タグ付きテンプレートの外部パッケージ名決定、規則a)が共有する
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

// クラス宣言・メソッド宣言のどちらの modifiers 配列からも使える共有の decorator 抽出。
// getFunctionDeclarations (メソッド) と getClassDeclarations (クラス) の双方が
// 「名前・行・引数のクラス識別」を必要とするため統一する(team-lead 決定によるレイヤリング修正)
export const decoratorInfoList = (
  sourceFile: TSSourceFile,
  modifiers: readonly TSModifierLike[] | undefined,
  checker: TSTypeChecker,
  ts: TypeScriptModule,
): readonly LocalDecoratorInfo[] => {
  const result: LocalDecoratorInfo[] = [];
  for (const m of modifiers ?? []) {
    if (!ts.isDecorator(m)) continue;
    const name = getDecoratorName(m.expression, ts);
    if (name === undefined) continue;
    result.push({
      name,
      line: sourceFile.getLineAndCharacterOfPosition(m.getStart(sourceFile)).line + 1,
      args: decoratorArgs(m.expression, checker, ts),
    });
  }
  return result;
};
