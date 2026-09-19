import { resolve } from 'node:path';

import type { ResultAsync } from 'neverthrow';
import { errAsync, okAsync } from 'neverthrow';

import {
  collectFunctionDeclarations,
  resolveDeclarationByOwnerAndName,
} from './function-collect.lib';
import type { FunctionContract, FunctionRef, InspectError } from './inspect.types';
import type { ProgramCacheError } from './program-cache.lib';
import { getOrCreateProgram } from './program-cache.lib';

const DEFAULT_TSCONFIG = './tsconfig.json';

type TypeScriptModule = typeof import('typescript');
type TSTypeChecker = import('typescript').TypeChecker;
type TSFunctionLike =
  | import('typescript').MethodDeclaration
  | import('typescript').GetAccessorDeclaration
  | import('typescript').SetAccessorDeclaration
  | import('typescript').FunctionDeclaration
  | import('typescript').ArrowFunction
  | import('typescript').FunctionExpression;

const ownerOf = (ref: FunctionRef): string | undefined =>
  ref.kind === 'method' ? ref.owner : undefined;

// team-lead 決定(Task 10 remaining-diff cause 7): typeToString に enclosingDeclaration
// (関数/メソッド宣言自身)と TypeFormatFlags.UseFullyQualifiedType を渡す。
// 実測で確認済み: enclosingDeclaration だけでは `import("pkg").X` 修飾は付かない
// (UseFullyQualifiedType が無いと、その型がどのスコープからも「裸の名前で参照可能では
// ない」場合でも checker は単に裸の名前を出すだけで、修飾を省略してしまう)。
// UseFullyQualifiedType 単体を enclosingDeclaration 無しで使うと、パッケージ名ではなく
// 解決済みの絶対パスで修飾されてしまう(`import("/path/to/node_modules/...")`)ため、
// 両方を組み合わせる必要がある。型がそのファイルのスコープから直接参照可能な場合
// (import 済みの型をそのまま使っている場合)は、この2つを組み合わせても修飾は付かず
// 裸の名前のまま(ec-backend の app.ts のように、`App`/`HttpFeature` 等の型自体を
// import せず関数の戻り値からの型推論だけに頼っている場合にのみ修飾が必要になる。
// 実測で両方確認済み)
const signatureOf = (
  node: TSFunctionLike,
  checker: TSTypeChecker,
  ts: TypeScriptModule,
): FunctionContract | undefined => {
  const sig = checker.getSignatureFromDeclaration(node);
  if (!sig) return undefined;
  const flags = ts.TypeFormatFlags.UseFullyQualifiedType;
  return {
    params: sig.getParameters().map((param) => ({
      name: param.getName(),
      // getTypeOfSymbol は宣言コンテキストを渡せず、ジェネリックメソッドの引数で
      // 解決に失敗しうるため AtLocation 版を使う(get-public-method-signatures.lib.ts と同じ理由)
      type: checker.typeToString(checker.getTypeOfSymbolAtLocation(param, node), node, flags),
    })),
    returnType: checker.typeToString(sig.getReturnType(), node, flags),
  };
};

/** @throws {UnsupportedTypeScriptVersionError} */
export const getFunctionSignature = (
  ref: FunctionRef,
  options?: { readonly tsconfig?: string },
): ResultAsync<FunctionContract, InspectError | ProgramCacheError> => {
  const tsconfigPath = resolve(options?.tsconfig ?? DEFAULT_TSCONFIG);
  return getOrCreateProgram(tsconfigPath).andThen(({ program, checker, ts }) => {
    const sourceFile = program.getSourceFile(ref.filePath);
    if (!sourceFile) {
      return errAsync<FunctionContract, InspectError>({
        code: 'SOURCE_NOT_FOUND',
        message: `Source file not found: ${ref.filePath}`,
      });
    }
    const owner = ownerOf(ref);
    const declarations = collectFunctionDeclarations(sourceFile, checker, ts);
    // owner 自体が存在しない場合の EXPORT_NOT_FOUND、該当なしの SIGNATURE_NOT_FOUND、
    // get/set 同名共存等で複数一致する場合の AMBIGUOUS_MEMBER(レビュー指摘4・5)は
    // getCallSites と共有のロジック(function-collect.lib.ts)にまとめてある。
    // 制約: owner クラスがメソッドを一切持たない(コンストラクタのみ等)場合は
    // EXPORT_NOT_FOUND のチェックでは検出できず EXPORT_NOT_FOUND になる(実例が無いため未対応のまま残す)
    const resolved = resolveDeclarationByOwnerAndName(declarations, owner, ref.name, ref.filePath);
    if (resolved.kind === 'error') return errAsync<FunctionContract, InspectError>(resolved.error);
    const collected = resolved.fn;
    const sig = signatureOf(collected.node, checker, ts);
    if (!sig) {
      return errAsync<FunctionContract, InspectError>({
        code: 'SIGNATURE_NOT_FOUND',
        message: `No signature for ${ref.name} in ${ref.filePath}`,
      });
    }
    return okAsync(sig);
  });
};
