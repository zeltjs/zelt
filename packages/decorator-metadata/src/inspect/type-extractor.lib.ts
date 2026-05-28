import { match } from 'ts-pattern';

import type { ExpandStrategy, TypedPropertyInfo, TypeInfo } from './inspect.types';

type TypeScriptModule = typeof import('typescript');
type TSType = import('typescript').Type;
type TSTypeChecker = import('typescript').TypeChecker;

const MAX_DEPTH = 10;

const checkFlag = (flags: number, flag: number): boolean => (flags & flag) !== 0;

const isExported = (
  decl: import('typescript').Declaration | undefined,
  ts: TypeScriptModule,
): boolean => {
  if (!decl) return false;
  const modifiers = ts.canHaveModifiers(decl) ? ts.getModifiers(decl) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
};

const shouldKeepAsRef = (
  symbol: import('typescript').Symbol,
  strategy: ExpandStrategy,
  ts: TypeScriptModule,
): boolean =>
  match(strategy)
    .with('always', () => false)
    .with('exported-only', () => {
      const decl = symbol.declarations?.[0];
      return decl ? isExported(decl, ts) : false;
    })
    .with('all-named', () => {
      const decl = symbol.declarations?.[0];
      return decl !== undefined;
    })
    .exhaustive();

type ExtractContext = {
  readonly ts: TypeScriptModule;
  readonly checker: TSTypeChecker;
  readonly expandStrategy: ExpandStrategy;
};

const extractPrimitive = (flags: number, ts: TypeScriptModule): TypeInfo | undefined =>
  match<number, TypeInfo | undefined>(flags)
    .when(
      (f) => checkFlag(f, ts.TypeFlags.String),
      () => ({ kind: 'primitive', type: 'string' }),
    )
    .when(
      (f) => checkFlag(f, ts.TypeFlags.Number),
      () => ({ kind: 'primitive', type: 'number' }),
    )
    .when(
      (f) => checkFlag(f, ts.TypeFlags.Boolean),
      () => ({ kind: 'primitive', type: 'boolean' }),
    )
    .when(
      (f) => checkFlag(f, ts.TypeFlags.Null),
      () => ({ kind: 'primitive', type: 'null' }),
    )
    .when(
      (f) => checkFlag(f, ts.TypeFlags.Undefined),
      () => ({ kind: 'primitive', type: 'undefined' }),
    )
    .otherwise(() => undefined);

const extractLiteral = (type: TSType, flags: number, ts: TypeScriptModule): TypeInfo | undefined =>
  match<TSType, TypeInfo | undefined>(type)
    .when(
      (t) => t.isStringLiteral(),
      (t) => ({ kind: 'literal', value: (t as import('typescript').StringLiteralType).value }),
    )
    .when(
      (t) => t.isNumberLiteral(),
      (t) => ({ kind: 'literal', value: (t as import('typescript').NumberLiteralType).value }),
    )
    .when(
      () => checkFlag(flags, ts.TypeFlags.BooleanLiteral),
      (t) => ({
        kind: 'literal',
        value: (t as { intrinsicName?: string }).intrinsicName === 'true',
      }),
    )
    .otherwise(() => undefined);

const extractUnion = (
  type: TSType,
  depth: number,
  extractFn: (t: TSType, d: number) => TypeInfo,
): TypeInfo | undefined =>
  type.isUnion()
    ? { kind: 'union', types: type.types.map((t) => extractFn(t, depth + 1)) }
    : undefined;

const extractArray = (
  type: TSType,
  depth: number,
  checker: TSTypeChecker,
  extractFn: (t: TSType, d: number) => TypeInfo,
): TypeInfo | undefined => {
  if (!checker.isArrayType(type)) return undefined;
  const typeRef = type as import('typescript').TypeReference;
  const elemType = typeRef.typeArguments?.[0];
  return {
    kind: 'array',
    items: elemType ? extractFn(elemType, depth + 1) : { kind: 'unknown' },
  };
};

const extractPromise = (
  type: TSType,
  depth: number,
  checker: TSTypeChecker,
  extractFn: (t: TSType, d: number) => TypeInfo,
): TypeInfo | undefined => {
  const typeStr = checker.typeToString(type);
  if (!typeStr.startsWith('Promise<')) return undefined;
  const typeRef = type as import('typescript').TypeReference;
  const innerType = typeRef.typeArguments?.[0];
  return {
    kind: 'promise',
    inner: innerType ? extractFn(innerType, depth + 1) : { kind: 'unknown' },
  };
};

const extractNamed = (type: TSType, ctx: ExtractContext): TypeInfo | undefined => {
  const aliasSymbol = type.aliasSymbol;
  if (!aliasSymbol) return undefined;
  if (!shouldKeepAsRef(aliasSymbol, ctx.expandStrategy, ctx.ts)) return undefined;

  const decl = aliasSymbol.declarations?.[0];
  const sourceFile = decl?.getSourceFile();
  return {
    kind: 'named',
    name: aliasSymbol.getName(),
    module: sourceFile?.fileName ?? '',
    isExported: isExported(decl, ctx.ts),
  };
};

const extractObject = (
  type: TSType,
  depth: number,
  ctx: ExtractContext,
  extractFn: (t: TSType, d: number) => TypeInfo,
): TypeInfo | undefined => {
  const props = type.getProperties();
  if (props.length === 0) return undefined;

  const properties: TypedPropertyInfo[] = props.map((prop) => {
    const propType = ctx.checker.getTypeOfSymbol(prop);
    const isOptional = checkFlag(prop.flags, ctx.ts.SymbolFlags.Optional);
    return {
      name: prop.getName(),
      type: extractFn(propType, depth + 1),
      optional: isOptional,
    };
  });
  return { kind: 'object', properties };
};

const extractTypeImpl = (type: TSType, depth: number, ctx: ExtractContext): TypeInfo => {
  if (depth > MAX_DEPTH) return { kind: 'unknown' };

  const flags = type.getFlags();

  return (
    extractPrimitive(flags, ctx.ts) ??
    extractLiteral(type, flags, ctx.ts) ??
    extractUnion(type, depth, (t, d) => extractTypeImpl(t, d, ctx)) ??
    extractArray(type, depth, ctx.checker, (t, d) => extractTypeImpl(t, d, ctx)) ??
    extractPromise(type, depth, ctx.checker, (t, d) => extractTypeImpl(t, d, ctx)) ??
    extractNamed(type, ctx) ??
    extractObject(type, depth, ctx, (t, d) => extractTypeImpl(t, d, ctx)) ?? { kind: 'unknown' }
  );
};

export const createTypeExtractor = (
  tsModule: TypeScriptModule,
  checker: TSTypeChecker,
  expandStrategy: ExpandStrategy,
): { extractType: (type: TSType, depth?: number) => TypeInfo } => {
  const ctx: ExtractContext = { ts: tsModule, checker, expandStrategy };

  const extractType = (type: TSType, depth: number = 0): TypeInfo =>
    extractTypeImpl(type, depth, ctx);

  return { extractType };
};
