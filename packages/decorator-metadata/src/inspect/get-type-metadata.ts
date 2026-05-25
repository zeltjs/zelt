import { resolve } from 'node:path';

import type { ResultAsync } from 'neverthrow';
import { errAsync, okAsync } from 'neverthrow';

import type { Position, StackTrace } from '../runtime/position';
import { resolvePosition } from '../runtime/position';
import { getInternalClassMetadata } from '../runtime/store';
import { findClassAtPosition } from './ast-utils';
import type { ProgramCacheError } from './program-cache';
import { getOrCreateProgram } from './program-cache';
import { createTypeExtractor } from './type-extractor';
import type {
  ClassMetadata,
  InspectError,
  InspectOptions,
  MethodInfo,
  ParamInfo,
  PropertyInfo,
  TypeInfo,
} from './types';

const DEFAULT_TSCONFIG = './tsconfig.json';
const DEFAULT_EXPAND_STRATEGY = 'exported-only' as const;

type TypeScriptModule = typeof import('typescript');
type TSClassDeclaration = import('typescript').ClassDeclaration;
type TSMethodDeclaration = import('typescript').MethodDeclaration;
type TSPropertyDeclaration = import('typescript').PropertyDeclaration;
type TSTypeChecker = import('typescript').TypeChecker;
type ExtractTypeFn = (type: import('typescript').Type) => TypeInfo;

type StoredMethodMeta = {
  readonly name: string | symbol;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
};
type StoredPropertyMeta = {
  readonly name: string | symbol;
  readonly trace: StackTrace | undefined;
  readonly props: readonly object[];
};

const findMethodInClass = (
  cls: TSClassDeclaration,
  name: string,
  ts: TypeScriptModule,
): TSMethodDeclaration | undefined => {
  for (const member of cls.members) {
    if (ts.isMethodDeclaration(member) && member.name.getText() === name) {
      return member;
    }
  }
  return undefined;
};

const findPropertyInClass = (
  cls: TSClassDeclaration,
  name: string,
  ts: TypeScriptModule,
): TSPropertyDeclaration | undefined => {
  for (const member of cls.members) {
    if (ts.isPropertyDeclaration(member) && member.name.getText() === name) {
      return member;
    }
  }
  return undefined;
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
    const methodNode = findMethodInClass(classNode, m.name, ts);
    if (methodNode) {
      const sig = checker.getSignatureFromDeclaration(methodNode);
      if (sig) {
        for (const param of sig.getParameters()) {
          const paramType = checker.getTypeOfSymbol(param);
          params.push({ name: param.getName(), type: extractType(paramType) });
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
    const propNode = findPropertyInClass(classNode, p.name, ts);
    if (propNode) {
      const propSymbol = checker.getSymbolAtLocation(propNode.name);
      if (propSymbol) {
        const propType = checker.getTypeOfSymbol(propSymbol);
        type = extractType(propType);
        optional = (propSymbol.flags & ts.SymbolFlags.Optional) !== 0;
      }
    }
  }

  const pos = resolvePosition(p.trace);
  return { name: p.name, pos, props: p.props, type, optional };
};

type ResolvedStoredMeta = {
  readonly storedMeta: NonNullable<ReturnType<typeof getInternalClassMetadata>>;
  readonly storedPos: Position;
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
  const storedPos = resolvePosition(storedMeta.trace);
  if (!storedPos) {
    return {
      ok: false,
      error: {
        code: 'POSITION_INVALID',
        message: `No source position captured for class ${cls.name}`,
      },
    };
  }
  return { ok: true, value: { storedMeta, storedPos } };
};

/** @throws {UnsupportedTypeScriptVersionError} */
export const getTypeMetadata = <T extends object>(
  cls: new (...args: unknown[]) => T,
  options?: InspectOptions,
): ResultAsync<ClassMetadata, InspectError | ProgramCacheError> => {
  const resolved = resolveStoredMeta(cls);
  if (!resolved.ok) return errAsync(resolved.error);
  const { storedMeta, storedPos } = resolved.value;

  const tsconfigPath = resolve(options?.tsconfig ?? DEFAULT_TSCONFIG);
  const expandStrategy = options?.expandStrategy ?? DEFAULT_EXPAND_STRATEGY;

  return getOrCreateProgram(tsconfigPath).andThen((cached) => {
    const { program, checker, ts } = cached;
    const { extractType } = createTypeExtractor(ts, checker, expandStrategy);

    const sourceFile = program.getSourceFile(storedPos.sourceFile);
    if (!sourceFile) {
      return errAsync<ClassMetadata, InspectError>({
        code: 'SOURCE_NOT_FOUND',
        message: `Source file not found: ${storedPos.sourceFile}`,
      });
    }

    const pos = ts.getPositionOfLineAndCharacter(
      sourceFile,
      storedPos.line - 1,
      storedPos.column - 1,
    );

    const classNode = findClassAtPosition(sourceFile, pos, ts);
    if (!classNode || !ts.isClassDeclaration(classNode)) {
      return errAsync<ClassMetadata, InspectError>({
        code: 'POSITION_INVALID',
        message: `No class found at position ${storedPos.line}:${storedPos.column}`,
      });
    }

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
