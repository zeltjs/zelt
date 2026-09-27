import { decoratorInfoList } from './ast.lib';
import { buildExportAliasMaps } from './get-dependency-sources.lib';
import type { DecoratorInfo, FunctionRef, InspectError } from './inspect.types';

type ExportAliasMaps = ReturnType<typeof buildExportAliasMaps>;

type TypeScriptModule = typeof import('typescript');
type TSTypeChecker = import('typescript').TypeChecker;
type TSSourceFile = import('typescript').SourceFile;
type TSClassDeclaration = import('typescript').ClassDeclaration;
type TSMethodDeclaration = import('typescript').MethodDeclaration;
type TSAccessorDeclaration =
  | import('typescript').GetAccessorDeclaration
  | import('typescript').SetAccessorDeclaration;
// クラスメンバ側で FnNode になり得るノード。get/set accessor を含める理由は
// 設計判断メモ 12 を参照(実例: ec-backend の EcJwtConfig.secret 等は get accessor)
type TSClassMember = TSMethodDeclaration | TSAccessorDeclaration;
type TSFunctionDeclaration = import('typescript').FunctionDeclaration;
type TSArrowFunction = import('typescript').ArrowFunction;
type TSFunctionExpression = import('typescript').FunctionExpression;

// getFunctionDeclarations(列挙) / getFunctionSignature・getCallSites(1件特定)が
// 共有する「本体を持つ関数/メソッド宣言」の集約結果。owner 無し = モジュール関数
export type CollectedFunction = {
  readonly owner: string | undefined;
  readonly name: string;
  readonly node: TSClassMember | TSFunctionDeclaration | TSArrowFunction | TSFunctionExpression;
  readonly decorators: readonly DecoratorInfo[];
  readonly visibility: 'public' | 'private';
};

const toRef = (filePath: string, fn: CollectedFunction): FunctionRef =>
  fn.owner === undefined
    ? { kind: 'function', filePath, name: fn.name }
    : { kind: 'method', filePath, owner: fn.owner, name: fn.name };

export const collectedFunctionRef = toRef;

// レビュー指摘5: get/set accessor が同名で共存する場合(design memo 12 の未対応ケース)、
// owner+name だけでは一意に決まらない。「1件特定」系の呼び出し元
// (getFunctionSignature/getCallSites)が黙って先勝ちで選ぶと、たまたま最初に見つかった
// accessor の契約/呼び出しサイトを、利用者が意図したのとは違う方(get か set か)に対して
// 返しかねない。呼び出し元が not-found/ambiguous/found を明示的に分岐できるよう
// Result 型で返す(単一リテラル型の判別フィールドなので readonly は付けない。
// no-redundant-readonly-literal)
export type FindByOwnerAndNameResult =
  | { kind: 'not-found' }
  | { kind: 'ambiguous'; readonly count: number }
  | { kind: 'found'; readonly fn: CollectedFunction };

const findByOwnerAndName = (
  declarations: readonly CollectedFunction[],
  owner: string | undefined,
  name: string,
): FindByOwnerAndNameResult => {
  const matches = declarations.filter((fn) => fn.owner === owner && fn.name === name);
  // noUncheckedIndexedAccess: 配列インデックスアクセスを避け、分割代入で先頭2件を見る
  const [first, second] = matches;
  if (first === undefined) return { kind: 'not-found' };
  if (second !== undefined) return { kind: 'ambiguous', count: matches.length };
  return { kind: 'found', fn: first };
};

export type ResolveDeclarationResult =
  | { kind: 'found'; readonly fn: CollectedFunction }
  | { kind: 'error'; readonly error: InspectError };

// getFunctionSignature/getCallSites が共有する「owner+name から1件を特定する」ロジック全体
// (owner 自体が無ければ EXPORT_NOT_FOUND、該当なしなら SIGNATURE_NOT_FOUND、複数一致なら
// AMBIGUOUS_MEMBER、のエラーメッセージ整形まで含む。max-lines-per-function 対策も兼ねて、
// 元々2箇所にほぼ同一のまま複製されていたこのブロックを1箇所にまとめる)
export const resolveDeclarationByOwnerAndName = (
  declarations: readonly CollectedFunction[],
  owner: string | undefined,
  name: string,
  filePath: string,
): ResolveDeclarationResult => {
  // レビュー指摘4/5と同種の区別: owner 自体が無い場合は EXPORT_NOT_FOUND、owner はあるが
  // 該当メソッド/関数が無い場合は SIGNATURE_NOT_FOUND
  if (owner !== undefined && !declarations.some((fn) => fn.owner === owner)) {
    return {
      kind: 'error',
      error: { code: 'EXPORT_NOT_FOUND', message: `No class named ${owner} in ${filePath}` },
    };
  }
  const found = findByOwnerAndName(declarations, owner, name);
  if (found.kind === 'ambiguous') {
    return {
      kind: 'error',
      error: {
        code: 'AMBIGUOUS_MEMBER',
        message:
          owner === undefined
            ? `${found.count} module-scope declarations named ${name} in ${filePath}`
            : `${found.count} members named ${name} on class ${owner} in ${filePath} (e.g. a get/set accessor pair)`,
      },
    };
  }
  if (found.kind === 'not-found') {
    return {
      kind: 'error',
      error: {
        code: 'SIGNATURE_NOT_FOUND',
        message:
          owner === undefined
            ? `No module-scope function named ${name} in ${filePath}`
            : `No method named ${name} on class ${owner} in ${filePath}`,
      },
    };
  }
  return { kind: 'found', fn: found.fn };
};

const isPrivateModifier = (member: TSClassMember, ts: TypeScriptModule): boolean =>
  (ts.getModifiers(member) ?? []).some(
    (m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword,
  );

// instance/static いずれも対象。get/set accessor も対象に含める(設計判断メモ 12)。
// computed name / symbol name は安定した ID にならないため除外する
const methodsOf = (cls: TSClassDeclaration, ts: TypeScriptModule): TSClassMember[] => {
  const methods: TSClassMember[] = [];
  for (const member of cls.members) {
    const isMember =
      ts.isMethodDeclaration(member) || ts.isGetAccessor(member) || ts.isSetAccessor(member);
    if (!isMember) continue;
    if (!ts.isIdentifier(member.name)) continue;
    methods.push(member);
  }
  return methods;
};

// v3 の FnNode は本体(loc・呼び出し解決の対象)を必ず持つため、オーバーロードは
// 宣言シグネチャ(body 無し)ではなく実装シグネチャ(body 有り)1つに集約する
// (v2 の withoutOverloadImplementations とは逆方向。設計判断メモ 7 を参照)。
// get/set が同名で共存するケースは ec-backend に実例が無く未対応のまま残す(設計判断メモ 12)
const keepImplementationOnly = (methods: readonly TSClassMember[]): TSClassMember[] => {
  const nameCounts = new Map<string, number>();
  for (const m of methods) {
    const name = m.name.getText();
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  return methods.filter(
    (m) => (nameCounts.get(m.name.getText()) ?? 0) === 1 || m.body !== undefined,
  );
};

const collectClassMethods = (
  sourceFile: TSSourceFile,
  cls: TSClassDeclaration,
  checker: TSTypeChecker,
  ts: TypeScriptModule,
): CollectedFunction[] => {
  if (cls.name === undefined) return []; // 無名 default export クラスは owner を持てないため対象外
  const owner = cls.name.text;
  return keepImplementationOnly(methodsOf(cls, ts)).map((member) => ({
    owner,
    name: member.name.getText(),
    node: member,
    // ts.getModifiers() は TS 4.8 以降 decorator を除外して返すため使えない
    // (decoratorInfoList は Decorator ノードを isDecorator で判別する)。
    // get-dependencies.lib.ts の decl.modifiers 直読みと同じく raw の modifiers を渡す
    decorators: decoratorInfoList(sourceFile, member.modifiers, checker, ts),
    visibility: isPrivateModifier(member, ts) ? 'private' : 'public',
  }));
};

const hasExportModifier = (
  modifiers: readonly import('typescript').ModifierLike[] | undefined,
  ts: TypeScriptModule,
): boolean => (modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

// レビュー指摘8: `export { fn }` / `export { fn as alias }` のような別文での再export は
// 宣言自体に export 修飾子を持たないため hasExportModifier だけでは見えない。
// get-class-declarations.lib.ts と同じく buildExportAliasMaps(get-dependency-sources.lib.ts、
// クラス export 解決と共通の SSOT)の byLocal をそのまま流用する(名前の対応は不要で、
// 「再export されているかどうか」の真偽だけを使う)
const isVisiblePublic = (
  name: string,
  modifiers: readonly import('typescript').ModifierLike[] | undefined,
  aliases: ExportAliasMaps,
  ts: TypeScriptModule,
): boolean => hasExportModifier(modifiers, ts) || aliases.byLocal.has(name);

// トップレベルの `function foo() {}` 宣言
const collectFunctionDeclarationStatements = (
  sourceFile: TSSourceFile,
  aliases: ExportAliasMaps,
  ts: TypeScriptModule,
): CollectedFunction[] => {
  const results: CollectedFunction[] = [];
  for (const stmt of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(stmt) || stmt.name === undefined || stmt.body === undefined)
      continue;
    results.push({
      owner: undefined,
      name: stmt.name.text,
      node: stmt,
      decorators: [],
      visibility: isVisiblePublic(stmt.name.text, stmt.modifiers, aliases, ts)
        ? 'public'
        : 'private',
    });
  }
  return results;
};

// トップレベルの `const foo = () => {}` / `const foo = function () {}` 束縛
const collectVariableFunctionBindings = (
  sourceFile: TSSourceFile,
  aliases: ExportAliasMaps,
  ts: TypeScriptModule,
): CollectedFunction[] => {
  const results: CollectedFunction[] = [];
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.initializer === undefined) continue;
      const init = decl.initializer;
      if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) continue;
      results.push({
        owner: undefined,
        name: decl.name.text,
        node: init,
        decorators: [],
        visibility: isVisiblePublic(decl.name.text, stmt.modifiers, aliases, ts)
          ? 'public'
          : 'private',
      });
    }
  }
  return results;
};

// getFunctionDeclarations(列挙)と getFunctionSignature/getCallSites(1件特定)の
// 双方が使う唯一の走査ロジック(SSOT)。ファイル内の全クラスの全メソッド + 全モジュール関数を返す
export const collectFunctionDeclarations = (
  sourceFile: TSSourceFile,
  checker: TSTypeChecker,
  ts: TypeScriptModule,
): readonly CollectedFunction[] => {
  const results: CollectedFunction[] = [];
  for (const stmt of sourceFile.statements) {
    if (ts.isClassDeclaration(stmt))
      results.push(...collectClassMethods(sourceFile, stmt, checker, ts));
  }
  const aliases = buildExportAliasMaps(sourceFile, ts);
  results.push(...collectFunctionDeclarationStatements(sourceFile, aliases, ts));
  results.push(...collectVariableFunctionBindings(sourceFile, aliases, ts));
  return results;
};
