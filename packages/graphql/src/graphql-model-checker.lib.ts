type TS = typeof import('typescript');
type Type = import('typescript').Type;
type Checker = import('typescript').TypeChecker;

/** Reads resolver signatures through the type checker only; type annotations are never parsed. */
export type ModelTypeReader = { readonly checker: Checker; readonly ts: TS };

const LIB_FILE = /[\\/]typescript[\\/]lib[\\/]lib\..*\.d\.ts$/;

export const isLibSymbol = (
  symbol: import('typescript').Symbol | undefined,
  name: string,
): boolean =>
  symbol?.name === name &&
  Boolean(symbol.declarations?.some((d) => LIB_FILE.test(d.getSourceFile().fileName)));

export const typeText = (type: Type, reader: ModelTypeReader): string =>
  reader.checker.typeToString(type);

export const awaited = (type: Type, reader: ModelTypeReader): Type =>
  reader.checker.getAwaitedType(type) ?? type;

export const isPromiseLike = (type: Type, reader: ModelTypeReader): boolean =>
  awaited(type, reader) !== type;

/** Splits `T | null | undefined` into `T` and whether `null` / `undefined` were present. */
export const withoutNullish = (
  type: Type,
  reader: ModelTypeReader,
): { readonly type: Type; readonly nullable: boolean; readonly undefinable: boolean } => {
  if (!type.isUnion()) return { type, nullable: false, undefinable: false };
  return {
    type: reader.checker.getNonNullableType(type),
    nullable: type.types.some((member) => Boolean(member.flags & reader.ts.TypeFlags.Null)),
    undefinable: type.types.some((member) => Boolean(member.flags & reader.ts.TypeFlags.Undefined)),
  };
};

export const arrayElement = (type: Type, reader: ModelTypeReader): Type | undefined =>
  reader.checker.isArrayType(type)
    ? reader.checker.getIndexTypeOfType(type, reader.ts.IndexKind.Number)
    : undefined;

const parameterTypes = (type: Type, reader: ModelTypeReader): readonly Type[] => {
  const [signature] = type.getCallSignatures();
  return (signature?.getParameters() ?? []).map((parameter) =>
    reader.checker.getTypeOfSymbol(parameter),
  );
};

/**
 * Returns `[key, value]` of a TypeScript `Map` / `ReadonlyMap`; look-alike types are rejected.
 * The entry types are read from `forEach`'s callback because it exposes `V` and `K` unchanged.
 */
export const mapEntry = (
  type: Type,
  reader: ModelTypeReader,
): readonly [Type, Type] | undefined => {
  const symbol = type.getSymbol();
  if (!isLibSymbol(symbol, 'Map') && !isLibSymbol(symbol, 'ReadonlyMap')) return undefined;
  const forEach = reader.checker.getPropertyOfType(type, 'forEach');
  const [callback] = forEach ? parameterTypes(reader.checker.getTypeOfSymbol(forEach), reader) : [];
  const [value, key] = callback ? parameterTypes(callback, reader) : [];
  return key && value ? [key, value] : undefined;
};
