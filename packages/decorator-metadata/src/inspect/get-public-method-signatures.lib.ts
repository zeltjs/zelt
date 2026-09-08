import { resolve } from 'node:path';

import type { ResultAsync } from 'neverthrow';
import { errAsync, okAsync } from 'neverthrow';

import { findExportedClass } from './get-dependency-sources.lib';
import type {
  ClassSource,
  GetDependenciesOptions,
  InspectError,
  PublicMethodSignature,
} from './inspect.types';
import type { ProgramCacheError } from './program-cache.lib';
import { getOrCreateProgram } from './program-cache.lib';

const DEFAULT_TSCONFIG = './tsconfig.json';

type TypeScriptModule = typeof import('typescript');
type TSClassDeclaration = import('typescript').ClassDeclaration;
type TSMethodDeclaration = import('typescript').MethodDeclaration;
type TSTypeChecker = import('typescript').TypeChecker;

const hasExcludedModifier = (member: TSMethodDeclaration, ts: TypeScriptModule): boolean =>
  (ts.getModifiers(member) ?? []).some(
    (m) =>
      m.kind === ts.SyntaxKind.PrivateKeyword ||
      m.kind === ts.SyntaxKind.ProtectedKeyword ||
      m.kind === ts.SyntaxKind.StaticKeyword,
  );

// instance public メソッド宣言のみ。accessor は isMethodDeclaration が false、
// computed name / symbol name は安定した契約にならないため identifier 名のみ対象にする
const publicMethodsOf = (cls: TSClassDeclaration, ts: TypeScriptModule): TSMethodDeclaration[] => {
  const methods: TSMethodDeclaration[] = [];
  for (const member of cls.members) {
    if (!ts.isMethodDeclaration(member)) continue;
    if (!ts.isIdentifier(member.name)) continue;
    if (hasExcludedModifier(member, ts)) continue;
    methods.push(member);
  }
  return methods;
};

// オーバーロードは宣言シグネチャ(body なし)を列挙し、実装シグネチャ(body あり)は
// オーバーロードが存在する場合のみ除外する — クラスの公開型と一致させる
const withoutOverloadImplementations = (
  methods: readonly TSMethodDeclaration[],
): TSMethodDeclaration[] => {
  const nameCounts = new Map<string, number>();
  for (const m of methods) {
    const name = m.name.getText();
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  return methods.filter(
    (m) => (nameCounts.get(m.name.getText()) ?? 0) === 1 || m.body === undefined,
  );
};

const signatureOf = (
  method: TSMethodDeclaration,
  checker: TSTypeChecker,
): PublicMethodSignature | undefined => {
  const sig = checker.getSignatureFromDeclaration(method);
  // undefined は「握り潰さない」原則に従い呼び出し側で SIGNATURE_NOT_FOUND にする
  if (!sig) return undefined;
  return {
    name: method.name.getText(),
    params: sig.getParameters().map((param) => ({
      name: param.getName(),
      // getTypeOfSymbol は宣言コンテキストを渡せず、ジェネリッククラスのメソッド引数で
      // 解決に失敗しうるため AtLocation 版を使う
      type: checker.typeToString(checker.getTypeOfSymbolAtLocation(param, method)),
    })),
    returnType: checker.typeToString(sig.getReturnType()),
  };
};

/** @throws {UnsupportedTypeScriptVersionError} */
export const getPublicMethodSignatures = (
  source: ClassSource,
  options?: GetDependenciesOptions,
): ResultAsync<readonly PublicMethodSignature[], InspectError | ProgramCacheError> => {
  const tsconfigPath = resolve(options?.tsconfig ?? DEFAULT_TSCONFIG);
  return getOrCreateProgram(tsconfigPath).andThen((cached) => {
    const { program, checker, ts } = cached;
    const sourceFile = program.getSourceFile(source.filePath);
    if (!sourceFile) {
      return errAsync<readonly PublicMethodSignature[], InspectError>({
        code: 'SOURCE_NOT_FOUND',
        message: `Source file not found: ${source.filePath}`,
      });
    }
    // exportName は公開名（default / alias 含む）なので宣言名検索ではなく export 解決を使う
    const classNode = findExportedClass(sourceFile, source.exportName, ts);
    if (!classNode) {
      return errAsync<readonly PublicMethodSignature[], InspectError>({
        code: 'EXPORT_NOT_FOUND',
        message: `No class exported as ${source.exportName} in ${source.filePath}`,
      });
    }
    const methods = withoutOverloadImplementations(publicMethodsOf(classNode, ts));
    const signatures: PublicMethodSignature[] = [];
    for (const method of methods) {
      const sig = signatureOf(method, checker);
      if (!sig) {
        return errAsync<readonly PublicMethodSignature[], InspectError>({
          code: 'SIGNATURE_NOT_FOUND',
          message: `No signature for method ${method.name.getText()} in ${source.exportName} (${source.filePath})`,
        });
      }
      signatures.push(sig);
    }
    return okAsync(signatures);
  });
};
