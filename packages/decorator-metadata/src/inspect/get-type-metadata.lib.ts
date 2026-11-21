import { resolve } from 'node:path';

import type { ResultAsync } from 'neverthrow';
import { errAsync, okAsync } from 'neverthrow';

import type { StackTrace } from '../runtime/index';
import { getInternalClassMetadata } from '../runtime/index';
import { resolveClassDeclaration } from './class-declaration.lib';
import type {
  ClassMetadata,
  InspectError,
  InspectOptions,
  MethodInfo,
  ParamInfo,
  PropertyInfo,
  TypeInfo,
} from './inspect.types';
import type { Position } from './position.lib';
import { resolvePosition } from './position.lib';
import type { ProgramCacheError } from './program-cache.lib';
import { getOrCreateProgram } from './program-cache.lib';
import { createTypeExtractor } from './type-extractor.lib';

const DEFAULT_TSCONFIG = './tsconfig.json';
const DEFAULT_EXPAND_STRATEGY = 'exported-only' as const;

type TypeScriptModule = typeof import('typescript');
type TSClassDeclaration = import('typescript').ClassDeclaration;
type TSMethodDeclaration = import('typescript').MethodDeclaration;
type TSSignature = import('typescript').Signature;
type TSSymbol = import('typescript').Symbol;
type TSTypeChecker = import('typescript').TypeChecker;
type ExtractTypeFn = (type: import('typescript').Type) => TypeInfo;

type StoredMethodMeta = {
  readonly name: string | symbol;
  readonly isStatic: boolean;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
};
type StoredPropertyMeta = {
  readonly name: string | symbol;
  readonly isStatic: boolean;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
};

// The member symbol is read through the class's own instance/constructor type so that
// members inherited from a generic base come back instantiated with the derived type arguments.
const findMemberSymbol = (
  cls: TSClassDeclaration,
  name: string,
  isStatic: boolean,
  checker: TSTypeChecker,
): TSSymbol | undefined => {
  if (!isStatic) return checker.getPropertyOfType(checker.getTypeAtLocation(cls), name);
  const classSymbol = cls.name ? checker.getSymbolAtLocation(cls.name) : undefined;
  return classSymbol
    ? checker.getPropertyOfType(checker.getTypeOfSymbol(classSymbol), name)
    : undefined;
};

type FoundMethod = { readonly symbol: TSSymbol; readonly node: TSMethodDeclaration };

const findMethodInClass = (
  cls: TSClassDeclaration,
  m: StoredMethodMeta & { readonly name: string },
  ts: TypeScriptModule,
  checker: TSTypeChecker,
): FoundMethod | undefined => {
  const symbol = findMemberSymbol(cls, m.name, m.isStatic, checker);
  const methods = (symbol?.declarations ?? []).filter(ts.isMethodDeclaration);
  const node = methods.find((method) => method.body !== undefined) ?? methods[0];
  return symbol && node ? { symbol, node } : undefined;
};

const findPropertyInClass = (
  cls: TSClassDeclaration,
  p: StoredPropertyMeta & { readonly name: string },
  ts: TypeScriptModule,
  checker: TSTypeChecker,
): TSSymbol | undefined => {
  const symbol = findMemberSymbol(cls, p.name, p.isStatic, checker);
  return symbol?.declarations?.some(ts.isPropertyDeclaration) ? symbol : undefined;
};

// Overload implementations are not part of the member type's call signatures, so they
// fall back to the declaration's own (uninstantiated) signature.
const methodSignature = (
  method: FoundMethod,
  ts: TypeScriptModule,
  checker: TSTypeChecker,
): TSSignature | undefined =>
  checker
    .getSignaturesOfType(checker.getTypeOfSymbol(method.symbol), ts.SignatureKind.Call)
    .find((signature) => signature.getDeclaration() === method.node) ??
  checker.getSignatureFromDeclaration(method.node);

const paramPosition = (
  param: import('typescript').Symbol,
  ts: TypeScriptModule,
): Position | undefined => {
  const decl = param.valueDeclaration ?? param.declarations?.[0];
  if (!decl) return undefined;
  const sourceFile = decl.getSourceFile();
  const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, decl.getStart());
  return { sourceFile: sourceFile.fileName, line: line + 1, column: character + 1 };
};

const extractMethodInfo = (
  m: StoredMethodMeta,
  classNode: TSClassDeclaration,
  ts: TypeScriptModule,
  checker: TSTypeChecker,
  extractType: ExtractTypeFn,
): MethodInfo => {
  const params: ParamInfo[] = [];
  let returnType: TypeInfo = { kind: 'unknown' };

  if (typeof m.name === 'string') {
    const method = findMethodInClass(classNode, { ...m, name: m.name }, ts, checker);
    if (method) {
      const sig = methodSignature(method, ts, checker);
      if (sig) {
        for (const param of sig.getParameters()) {
          const paramType = checker.getTypeOfSymbol(param);
          params.push({
            name: param.getName(),
            type: extractType(paramType),
            pos: paramPosition(param, ts),
          });
        }

        let retType = sig.getReturnType();
        const retTypeStr = checker.typeToString(retType);
        if (retTypeStr.startsWith('Promise<')) {
          const typeRef = retType as import('typescript').TypeReference;
          retType = typeRef.typeArguments?.[0] ?? retType;
        }
        returnType = extractType(retType);
      }
    }
  }

  const pos = resolvePosition(m.trace);
  return { name: m.name, pos, props: m.props, params, returnType };
};

const extractPropertyInfo = (
  p: StoredPropertyMeta,
  classNode: TSClassDeclaration,
  ts: TypeScriptModule,
  checker: TSTypeChecker,
  extractType: ExtractTypeFn,
): PropertyInfo => {
  let type: TypeInfo = { kind: 'unknown' };
  let optional = false;

  if (typeof p.name === 'string') {
    const propSymbol = findPropertyInClass(classNode, { ...p, name: p.name }, ts, checker);
    if (propSymbol) {
      type = extractType(checker.getTypeOfSymbol(propSymbol));
      optional = (propSymbol.flags & ts.SymbolFlags.Optional) !== 0;
    }
  }

  const pos = resolvePosition(p.trace);
  return { name: p.name, pos, props: p.props, type, optional };
};

type ResolvedStoredMeta = {
  readonly storedMeta: NonNullable<ReturnType<typeof getInternalClassMetadata>>;
};

const resolveStoredMeta = <T extends object>(
  cls: new (...args: unknown[]) => T,
): { ok: true; value: ResolvedStoredMeta } | { ok: false; error: InspectError } => {
  const storedMeta = getInternalClassMetadata(cls);
  if (!storedMeta) {
    return {
      ok: false,
      error: { code: 'NO_METADATA', message: `No decorator metadata found for class ${cls.name}` },
    };
  }
  return { ok: true, value: { storedMeta } };
};

/** @throws {UnsupportedTypeScriptVersionError} */
export const getTypeMetadata = <T extends object>(
  cls: new (...args: unknown[]) => T,
  options?: InspectOptions,
): ResultAsync<ClassMetadata, InspectError | ProgramCacheError> => {
  const resolved = resolveStoredMeta(cls);
  if (!resolved.ok) return errAsync(resolved.error);
  const { storedMeta } = resolved.value;

  const tsconfigPath = resolve(options?.tsconfig ?? DEFAULT_TSCONFIG);
  const expandStrategy = options?.expandStrategy ?? DEFAULT_EXPAND_STRATEGY;

  return getOrCreateProgram(tsconfigPath).andThen((cached) => {
    const { checker, ts } = cached;
    const { extractType } = createTypeExtractor(ts, checker, expandStrategy);

    const declaration = resolveClassDeclaration(cls, storedMeta.trace, cached);
    if (declaration.isErr()) return errAsync<ClassMetadata, InspectError>(declaration.error);
    const { node: classNode, position: storedPos } = declaration.value;

    const methods = storedMeta.methods.map((m) =>
      extractMethodInfo(m, classNode, ts, checker, extractType),
    );
    const properties = storedMeta.properties.map((p) =>
      extractPropertyInfo(p, classNode, ts, checker, extractType),
    );

    return okAsync({
      name: cls.name,
      pos: storedPos,
      props: storedMeta.props,
      methods,
      properties,
    });
  });
};
