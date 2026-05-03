import { type MethodDeclaration, Node, type Type } from 'ts-morph';

export type ResponseTypeInfo =
  | { kind: 'ts-named'; readonly name: string; readonly module: string }
  | { kind: 'ts-anonymous'; readonly typeText: string }
  | {
      kind: 'typed-response';
      readonly bodyTypeText: string;
      readonly status: number;
      readonly format: string;
    }
  | { kind: 'unresolvable' };

const isUnknownOrAny = (t: Type): boolean => t.isAny() || t.isUnknown();

// async method の return type は Promise<T>。中身を取り出す。
const unwrapPromise = (t: Type): Type => {
  if (t.getSymbol()?.getName() !== 'Promise') return t;
  const arg = t.getTypeArguments()[0];
  return arg ?? t;
};

// TypedResponse は type alias なので getTypeArguments() ではなく getAliasTypeArguments() を使う。
const getTypedResponseArgs = (inner: Type): readonly Type[] => {
  const aliasArgs = inner.getAliasTypeArguments();
  return aliasArgs.length > 0 ? aliasArgs : inner.getTypeArguments();
};

const analyzeTypedResponse = (inner: Type, m: MethodDeclaration): ResponseTypeInfo => {
  const args = getTypedResponseArgs(inner);
  const bodyTypeText = args[0]?.getText(m) ?? 'unknown';
  const statusLit = args[1]?.getLiteralValue();
  const formatLit = args[2]?.getLiteralValue();
  return {
    kind: 'typed-response',
    bodyTypeText,
    status: typeof statusLit === 'number' ? statusLit : 200,
    format: typeof formatLit === 'string' ? formatLit : 'json',
  };
};

// alias / interface 宣言から named type 情報を取り出す。該当しなければ undefined。
const tryNamedType = (inner: Type): ResponseTypeInfo | undefined => {
  const aliasSym = inner.getAliasSymbol() ?? inner.getSymbol();
  if (!aliasSym) return undefined;
  const decl = aliasSym.getDeclarations()[0];
  if (!decl) return undefined;
  if (!Node.isTypeAliasDeclaration(decl) && !Node.isInterfaceDeclaration(decl)) return undefined;
  return {
    kind: 'ts-named',
    name: aliasSym.getName(),
    module: decl.getSourceFile().getFilePath(),
  };
};

// hono の TypedResponse は type alias なので getSymbol() ではなく getAliasSymbol() で名前が取れる。
// 両方 fallback しておくことで future-proof にする。
const isTypedResponse = (t: Type): boolean => {
  if (t.getAliasSymbol()?.getName() === 'TypedResponse') return true;
  return t.getSymbol()?.getName() === 'TypedResponse';
};

export const analyzeResponseType = (m: MethodDeclaration): ResponseTypeInfo => {
  const inner = unwrapPromise(m.getReturnType());

  if (isUnknownOrAny(inner)) return { kind: 'unresolvable' };

  if (isTypedResponse(inner)) {
    return analyzeTypedResponse(inner, m);
  }

  const named = tryNamedType(inner);
  if (named) return named;

  return { kind: 'ts-anonymous', typeText: inner.getText(m) };
};
