import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CallSite } from '../inspect/index';
import { clearProgramCache, getCallSites } from '../inspect/index';

const TSCONFIG = resolve(__dirname, '../../tsconfig.json');
const TARGETS = resolve(__dirname, './fixtures/call-sites/targets.ts');

const sitesOf = async (name: string): Promise<readonly CallSite[]> => {
  const result = await getCallSites(
    { kind: 'method', filePath: TARGETS, owner: 'Caller', name },
    { tsconfig: TSCONFIG },
  );
  if (!result.isOk()) throw new Error(`expected ok for ${name}: ${JSON.stringify(result)}`);
  return result.value;
};

// Task 5 追加(レビュー指摘2の super.m() ケース用): 対象クラスが Caller 以外のケースに使う
const sitesOfOwner = async (owner: string, name: string): Promise<readonly CallSite[]> => {
  const result = await getCallSites(
    { kind: 'method', filePath: TARGETS, owner, name },
    { tsconfig: TSCONFIG },
  );
  if (!result.isOk())
    throw new Error(`expected ok for ${owner}.${name}: ${JSON.stringify(result)}`);
  return result.value;
};

describe('getCallSites (target resolution)', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  it('resolves a bare call to a module-scope function as internal', async () => {
    const sites = await sitesOf('callBareInternal');
    expect(sites).toHaveLength(1);
    expect(sites[0]?.target).toEqual({
      kind: 'internal',
      ref: { kind: 'function', filePath: TARGETS, name: 'requireUser' },
    });
  });

  it('resolves this.method() as internal (same-class method call)', async () => {
    const sites = await sitesOf('callMethodOnSelf');
    expect(sites[0]?.target).toEqual({
      kind: 'internal',
      ref: { kind: 'method', filePath: TARGETS, owner: 'Caller', name: 'otherMethod' },
    });
  });

  it('resolves a property-access call to another internal class as internal', async () => {
    const sites = await sitesOf('callPropertyAccessInternal');
    expect(sites[0]?.target).toEqual({
      kind: 'internal',
      ref: { kind: 'method', filePath: TARGETS, owner: 'Helper', name: 'ping' },
    });
  });

  it('resolves a bare call to a Node builtin as external using the import specifier', async () => {
    const sites = await sitesOf('callExternalBare');
    expect(sites[0]?.target).toEqual({
      kind: 'external',
      package: 'node:crypto',
      member: 'randomBytes',
    });
  });

  it('does not record the chained .toString() call, only the outer randomBytes() call (レビュー再指摘1)', async () => {
    // isChainContinuation(spec 5(c))により、レシーバ式自体が CallExpression である
    // `.toString('hex')` はメソッドチェーンの中間として記録されない。randomBytes(16) 自体の
    // 1件のみが記録されることを確認する(以前はここで2件を期待しており、実装と矛盾していた)
    const sites = await sitesOf('callExternalPropertyAccess');
    expect(sites).toHaveLength(1);
    expect(sites[0]?.target).toEqual({
      kind: 'external',
      package: 'node:crypto',
      member: 'randomBytes',
    });
  });

  it('resolves a property-access call on an external-typed value (held in a variable) as external using the declaring package', async () => {
    // レシーバをローカル変数に代入すればチェーンの中間ではなくなるため、独立した呼び出しとして
    // 記録される(ec-backend の実例と同じ形)
    const sites = await sitesOf('callExternalPropertyAccessOnVariable');
    const external = sites.filter((s) => s.target.kind === 'external');
    expect(external).toContainEqual(
      expect.objectContaining({
        target: { kind: 'external', package: 'node:crypto', member: 'randomBytes' },
      }),
    );
    expect(external).toContainEqual(
      expect.objectContaining({
        target: { kind: 'external', package: 'node', member: 'Buffer.toString' },
      }),
    );
  });

  it('resolves new X(...) to an external class using the import specifier, no member suffix', async () => {
    // deviation memo: brief は hono の HTTPException を使うが、hono は
    // @zeltjs/decorator-metadata の依存に含まれない(pnpm の isolated node_modules では
    // 解決不可、Global Constraints: 新規パッケージ依存の追加は無い)ため、既存devDependency の
    // neverthrow の Ok クラス(明示 constructor を持つ実在クラス)で代替する
    const sites = await sitesOf('callExternalNew');
    expect(sites[0]?.target).toEqual({
      kind: 'external',
      package: 'neverthrow',
      member: 'Ok',
    });
  });

  it('resolves a property-access call to a real method DECLARATION on an external class as external, not internal (regression for review 1)', async () => {
    const sites = await sitesOf('callExternalClassMethod');
    const isOkCall = sites.find(
      (s) => s.target.kind === 'external' && s.target.member.endsWith('.isOk'),
    );
    expect(isOkCall?.target).toEqual({
      kind: 'external',
      package: 'neverthrow',
      member: 'Ok.isOk',
    });
  });

  it('resolves new X(...) to an internal class as internal-class', async () => {
    const sites = await sitesOf('callInternalNew');
    expect(sites[0]?.target).toEqual({ kind: 'internal-class', filePath: TARGETS, name: 'Helper' });
  });

  it('resolves new X(...) to an internal class with an explicit constructor as internal-class (レビュー再指摘3)', async () => {
    // Helper(暗黙 constructor)と違い、getResolvedSignature が ConstructorDeclaration を
    // 返す経路を通る。classDeclNameOf が ConstructorDeclaration.parent まで遡れないと
    // symbol-unresolved に落ちてしまうリグレッションガード
    const sites = await sitesOf('callInternalNewWithConstructor');
    expect(sites[0]?.target).toEqual({
      kind: 'internal-class',
      filePath: TARGETS,
      name: 'HelperWithCtor',
    });
  });

  it('collapses a method chain to a single call site at the innermost non-chained receiver', async () => {
    const sites = await sitesOf('callChain');
    // this.helper.ping() のみ記録。.toUpperCase()/.trim() はチェーンの一部として無視
    expect(sites).toHaveLength(1);
    expect(sites[0]?.target).toEqual({
      kind: 'internal',
      ref: { kind: 'method', filePath: TARGETS, owner: 'Helper', name: 'ping' },
    });
  });

  it('marks a call to a parameter of function type as unresolved: parameter-callback', async () => {
    const sites = await sitesOf('callUnresolvedParameterCallback');
    expect(sites[0]?.target).toEqual({
      kind: 'unresolved',
      expression: 'next()',
      reason: 'parameter-callback',
    });
  });

  it('marks a call to a variable holding a prior call result as unresolved: stored-function-reference', async () => {
    const sites = await sitesOf('callUnresolvedStoredReference');
    expect(sites).toHaveLength(2);
    expect(sites).toContainEqual(
      expect.objectContaining({
        target: {
          kind: 'internal',
          ref: { kind: 'method', filePath: TARGETS, owner: 'Helper', name: 'subscribe' },
        },
      }),
    );
    expect(sites).toContainEqual(
      expect.objectContaining({
        target: { kind: 'unresolved', expression: 'unsub()', reason: 'stored-function-reference' },
      }),
    );
  });

  // team-lead 決定(Task 10 remaining-diff cause 6): for-of の反復変数(呼び出し可能な型の
  // 配列プロパティを反復する束縛)も stored-function-reference に分類されるべき
  // (ec-backend の OrderHandlers.shutdown の実例: `for (const unsub of this.unsubscribes)
  // unsub()`)。initializer を持たない for-of 束縛は既存の「initializer が CallExpression」
  // 条件では検出できず symbol-unresolved に落ちていた
  it('marks a for-of loop variable over an array of functions as unresolved: stored-function-reference', async () => {
    const sites = await sitesOf('callUnresolvedStoredReferenceViaForOf');
    expect(sites).toHaveLength(1);
    expect(sites[0]?.target).toEqual({
      kind: 'unresolved',
      expression: 'unsub()',
      reason: 'stored-function-reference',
    });
    // 呼び出し自体は for-of の本体ブロックの中にあるため context は 'loop'
    // (reason の stored-function-reference とは独立した、別の分類軸)
    expect(sites[0]?.context).toBe('loop');
  });

  it('marks a computed property access call as unresolved: dynamic-property-access', async () => {
    const sites = await sitesOf('callUnresolvedDynamicProperty');
    expect(
      sites.some(
        (s) => s.target.kind === 'unresolved' && s.target.reason === 'dynamic-property-access',
      ),
    ).toBe(true);
  });

  it('marks a call through a value cast back to a function type as unresolved: symbol-unresolved (レビュー指摘14)', async () => {
    const sites = await sitesOf('callUnresolvedSymbol');
    // resolveCalleeDeclaration が解決する宣言(FunctionType ノード)は
    // functionRefOfDeclaration が internal ref を作れる形(MethodDeclaration/
    // FunctionDeclaration/変数=アロー関数)のいずれでもないため、他のどの reason にも
    // 分類されない catch-all(symbol-unresolved)に落ちることを確認する
    expect(sites).toHaveLength(1);
    expect(sites[0]?.target).toEqual({
      kind: 'unresolved',
      expression: '(raw as () => string)()',
      reason: 'symbol-unresolved',
    });
  });

  it('resolves a call through a plain method reference (no .bind()) as internal, not unresolved', async () => {
    // 未決事項メモの訂正: `const fn = obj.method;` は checker.getResolvedSignature が
    // 元のメソッド宣言まで解決するため、`.bind()` の場合(stored-function-reference)とは
    // 異なり internal として正しく解決される
    const sites = await sitesOf('callMethodReference');
    expect(sites).toHaveLength(1);
    expect(sites[0]?.target).toEqual({
      kind: 'internal',
      ref: { kind: 'method', filePath: TARGETS, owner: 'Helper', name: 'ping' },
    });
  });

  it('excludes calls into TypeScript default-lib declarations entirely (レビュー指摘15)', async () => {
    // Math.max/parseInt/[].map はいずれも lib.es5.d.ts で宣言されている
    // (isDefaultLib が program.isSourceFileDefaultLibrary で判定)。CallSite を
    // 一切生成しない(unresolvedCalls にも calls エッジにも現れない)ことを専用フィクスチャで確認する
    const sites = await sitesOf('callDefaultLibOnly');
    expect(sites).toHaveLength(0);
  });

  // team-lead 決定(Task 10 remaining-diff cause 2): パラメータの default 値の中の呼び出しは
  // body の外にあるため、以前は一切発見されなかった(ec-backend の
  // `async register(req = request(RegisterSchema))` の実例で missing edge として発覚)。
  // 発見されることに加え、context が 'plain' になることを確認する(default 値自体は
  // どの try/catch/branch/loop/callback の内側でもないため)
  it('discovers a call inside a default parameter value and classifies its context as plain', async () => {
    const sites = await sitesOf('callWithDefaultParameterValue');
    expect(sites).toHaveLength(1);
    expect(sites[0]?.target).toEqual({
      kind: 'internal',
      ref: { kind: 'function', filePath: TARGETS, name: 'requireUser' },
    });
    expect(sites[0]?.context).toBe('plain');
  });

  // team-lead 決定(Task 10 remaining-diff cause 4): 複数行にまたがるメソッドチェーンの line は
  // callExpr.getStart()(レシーバ式の先頭)ではなく、実際に呼び出されるメンバー名自身の行に
  // なるべき(ec-backend の `this.drizzle.db.select()` の実例)
  it('reports the line of the callee name token, not the receiver expression start, for a multi-line chained call', async () => {
    const sites = await sitesOf('callMultilineChain');
    expect(sites).toHaveLength(1);
    // callMultilineChain 内の `return this.helper` は235行目、`.ping();` は236行目
    // (fixtures/call-sites/targets.ts の実際の行に対応。ズレたらこのテストが検出する)
    expect(sites[0]?.line).toBe(236);
  });

  it('captures awaited=false for a synchronous call and sets firstArgLiteral when the first arg is a string literal', async () => {
    const sites = await sitesOf('callWithFirstArgLiteral');
    const emitLike = sites.find(
      (s) =>
        s.target.kind === 'internal' &&
        s.target.ref.kind === 'method' &&
        s.target.ref.name === 'emitLike',
    );
    expect(emitLike?.awaited).toBe(false);
    expect(emitLike?.firstArgLiteral).toBe('order:created');
  });

  it('resolves a bare call to a function imported from another file in the program as internal', async () => {
    const sites = await sitesOf('callImportedBareFunction');
    expect(sites[0]?.target).toEqual({
      kind: 'internal',
      ref: {
        kind: 'function',
        filePath: resolve(__dirname, './fixtures/call-sites/imported-helper.ts'),
        name: 'importedHelper',
      },
    });
  });

  it('returns EXPORT_NOT_FOUND when the owner class does not exist in the file (レビュー指摘4と同種)', async () => {
    const result = await getCallSites(
      { kind: 'method', filePath: TARGETS, owner: 'NoSuchClass', name: 'ping' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('EXPORT_NOT_FOUND');
  });

  it('returns SIGNATURE_NOT_FOUND when the method name does not exist on an existing owner', async () => {
    const result = await getCallSites(
      { kind: 'method', filePath: TARGETS, owner: 'Caller', name: 'noSuchMethod' },
      { tsconfig: TSCONFIG },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('SIGNATURE_NOT_FOUND');
  });

  // Task 4 レビューで追加指摘された4ケース(Task 5 で実装)

  it('resolves a bare call to a function imported through a re-export barrel as internal', async () => {
    const sites = await sitesOf('callViaBarrel');
    expect(sites[0]?.target).toEqual({
      kind: 'internal',
      ref: {
        kind: 'function',
        filePath: resolve(__dirname, './fixtures/call-sites/imported-helper.ts'),
        name: 'importedHelper',
      },
    });
  });

  it('resolves a tagged-template call like a regular call', async () => {
    const sites = await sitesOf('callTaggedTemplate');
    expect(sites[0]?.target).toEqual({
      kind: 'internal',
      ref: { kind: 'function', filePath: TARGETS, name: 'tag' },
    });
  });

  it('records the calls inside a chain argument (foo().bar(baz())), not the chain continuation itself', async () => {
    const sites = await sitesOf('callChainArgument');
    expect(sites).toHaveLength(2);
    const names = sites.map((s) => (s.target.kind === 'internal' ? s.target.ref.name : s.target));
    expect(names).toContain('foo');
    expect(names).toContain('baz');
  });

  // レビュー指摘4: ネストした function 宣言への呼び出しは記録せず、その本体内の呼び出しは
  // 既存どおり(境界で止まらない走査により)囲む関数の CallSite に含まれることを確認する
  it('does not record a call to a nested (non-top-level) function declaration, but still discovers calls inside its body', async () => {
    const sites = await sitesOf('callWithNestedFunctionDeclaration');
    expect(sites).toHaveLength(1);
    expect(sites[0]?.target).toEqual({
      kind: 'internal',
      ref: { kind: 'function', filePath: TARGETS, name: 'requireUser' },
    });
  });

  it('resolves super.m() to the parent class method declaration, not the subclass', async () => {
    const sites = await sitesOfOwner('DerivedGreeter', 'greet');
    expect(sites[0]?.target).toEqual({
      kind: 'internal',
      ref: { kind: 'method', filePath: TARGETS, owner: 'BaseGreeter', name: 'greet' },
    });
  });
});

const CONTEXTS = resolve(__dirname, './fixtures/call-sites/contexts.ts');

const contextSitesOf = async (name: string): Promise<readonly CallSite[]> => {
  const result = await getCallSites(
    { kind: 'method', filePath: CONTEXTS, owner: 'ContextExamples', name },
    { tsconfig: TSCONFIG },
  );
  if (!result.isOk()) throw new Error(`expected ok for ${name}`);
  return result.value;
};

describe('getCallSites (context classification)', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  it.each([
    ['tryContext', 'try'],
    ['catchContext', 'catch'],
    ['finallyContext', 'finally'],
    ['loopContext', 'loop'],
    ['callbackContext', 'callback'],
    ['plainContext', 'plain'],
  ] as const)('classifies %s as %s', async (method, expected) => {
    const sites = await contextSitesOf(method);
    expect(sites.every((s) => s.context === expected)).toBe(true);
    expect(sites.length).toBeGreaterThan(0);
  });

  it('classifies both branches of an if/else as branch', async () => {
    const sites = await contextSitesOf('branchContext');
    expect(sites).toHaveLength(2);
    expect(sites.every((s) => s.context === 'branch')).toBe(true);
  });

  it('classifies both branches of a ternary as branch', async () => {
    const sites = await contextSitesOf('ternaryBranchContext');
    expect(sites).toHaveLength(2);
    expect(sites.every((s) => s.context === 'branch')).toBe(true);
  });

  it('prefers the nearest enclosing structure: a loop inside a try is classified as loop', async () => {
    const sites = await contextSitesOf('loopWinsInsideTry');
    expect(sites).toHaveLength(1);
    expect(sites[0]?.context).toBe('loop');
  });

  // team-lead 決定(Task 10 remaining-diff cause 1): モジュールスコープの
  // `const f = () => {...}` 自身のトップレベル呼び出しは 'plain' になるべき(その関数自身の
  // ArrowFunction 宣言を「コールバックの中」と誤認しない)
  it('classifies a top-level call inside a module-scope arrow function as plain, not callback', async () => {
    const result = await getCallSites(
      { kind: 'function', filePath: CONTEXTS, name: 'moduleScopeArrowPlain' },
      { tsconfig: TSCONFIG },
    );
    if (!result.isOk()) throw new Error('expected ok');
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.context).toBe('plain');
  });

  it('classifies a top-level call inside a module-scope function declaration as plain (regression)', async () => {
    const result = await getCallSites(
      { kind: 'function', filePath: CONTEXTS, name: 'moduleScopeFunctionDeclarationPlain' },
      { tsconfig: TSCONFIG },
    );
    if (!result.isOk()) throw new Error('expected ok');
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.context).toBe('plain');
  });
});

// team-lead 決定(Task 10 remaining-diff cause 3): プロパティアクセス呼び出しの external
// member 名は、レシーバの見かけの型(alias 越しに具体化された型引数付きの表示、例
// `Accessor<string>`)ではなく、そのメンバーを実際に宣言している型リテラルの alias 名
// (例 `AccessorBase`)を使うべき。@zeltjs/core の
// `RequestAccessor<TBody> = RequestAccessorBase<TBody>` と同じ形(公開 alias が非公開の
// 型リテラル alias を指すだけ)を、リポジトリにコミットしない一時ディレクトリに
// node_modules 配下のフィクスチャとして再現する(class-source.test.ts の
// 「falls back to the package entry...」テストと同じ手法。tsconfig 自体も一時生成し、
// 既存のリポジトリの tsconfig には一切触れない)
describe('getCallSites (external member naming for a type-literal alias, Task 10 remaining-diff cause 3)', () => {
  it("uses the type alias that actually declares the member, not the receiver's differently-named generic alias", async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'call-sites-alias-')));
    try {
      const pkgDir = join(base, 'node_modules', 'alias-pkg');
      await mkdir(pkgDir, { recursive: true });
      await writeFile(
        join(pkgDir, 'index.ts'),
        [
          '// @zeltjs/core の RequestAccessor<TBody> = RequestAccessorBase<TBody> と同じ形:',
          '// 公開 alias (Accessor) が非公開の型リテラル alias (AccessorBase) を指すだけ',
          'export type AccessorBase<T> = {',
          '  body(): T;',
          '};',
          'export type Accessor<T = unknown> = AccessorBase<T>;',
          'export const makeAccessor = <T,>(value: T): Accessor<T> => ({ body: () => value });',
          '',
        ].join('\n'),
      );
      const srcDir = join(base, 'src');
      await mkdir(srcDir, { recursive: true });
      const callerPath = join(srcDir, 'caller.ts');
      await writeFile(
        callerPath,
        [
          "import { makeAccessor } from '../node_modules/alias-pkg/index';",
          '',
          'export class Caller {',
          '  callAliasMember(): string {',
          "    const accessor = makeAccessor('x');",
          '    return accessor.body();',
          '  }',
          '}',
          '',
        ].join('\n'),
      );
      const tsconfigPath = join(base, 'tsconfig.json');
      await writeFile(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'es2022',
            module: 'esnext',
            moduleResolution: 'bundler',
          },
          include: ['src/**/*', 'node_modules/alias-pkg/**/*'],
          exclude: [],
        }),
      );
      clearProgramCache();
      const result = await getCallSites(
        { kind: 'method', filePath: callerPath, owner: 'Caller', name: 'callAliasMember' },
        { tsconfig: tsconfigPath },
      );
      if (!result.isOk()) throw new Error(`expected ok: ${JSON.stringify(result)}`);
      const bodyCall = result.value.find(
        (s) => s.target.kind === 'external' && s.target.member.endsWith('.body'),
      );
      expect(bodyCall?.target).toEqual({
        kind: 'external',
        package: 'alias-pkg',
        member: 'AccessorBase.body',
      });
    } finally {
      await rm(base, { recursive: true, force: true });
      clearProgramCache();
    }
  });
});
