import type { Type, TypeChecker } from 'typescript';
import type { GraphqlModelResultShape } from './graphql-model.types';

type TS = typeof import('typescript');
type TypeSymbol = import('typescript').Symbol;
type TypeResult<T> = { ok: true; value: T } | { ok: false; message: string };

type NullableType = { readonly type: Type; readonly nullable: boolean };

const withoutNullish = (type: Type, ts: TS): TypeResult<NullableType> => {
  if (!type.isUnion()) return { ok: true, value: { type, nullable: false } };
  const members = type.types.filter(
    (member) => !(member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)),
  );
  const [member] = members;
  if (!member || members.length !== 1)
    return { ok: false, message: 'a relation must identify one model type' };
  return { ok: true, value: { type: member, nullable: members.length !== type.types.length } };
};

const declaredReference = (
  type: Type,
  checker: TypeChecker,
  ts: TS,
): TypeResult<{ target: Type; shape: GraphqlModelResultShape }> => {
  const outer = withoutNullish(type, ts);
  if (!outer.ok) return outer;
  if (!checker.isArrayType(outer.value.type))
    return {
      ok: true,
      value: { target: outer.value.type, shape: { kind: 'one', nullable: outer.value.nullable } },
    };
  const element = checker.getIndexTypeOfType(outer.value.type, ts.IndexKind.Number);
  if (!element) return { ok: false, message: 'cannot resolve the relation array element' };
  const inner = withoutNullish(element, ts);
  if (!inner.ok) return inner;
  return {
    ok: true,
    value: {
      target: inner.value.type,
      shape: {
        kind: 'many',
        nullable: outer.value.nullable,
        itemNullable: inner.value.nullable,
      },
    },
  };
};

const compatibleShape = (
  actual: GraphqlModelResultShape,
  declared: GraphqlModelResultShape,
): boolean => {
  if (actual.nullable && !declared.nullable) return false;
  if (actual.kind === 'one') return declared.kind === 'one';
  return declared.kind === 'many' && (!actual.itemNullable || declared.itemNullable);
};

export const checkRelationContract = (input: {
  readonly declared: Type;
  readonly target: TypeSymbol;
  readonly actualShape: GraphqlModelResultShape;
  readonly checker: TypeChecker;
  readonly ts: TS;
}): TypeResult<GraphqlModelResultShape> => {
  const reference = declaredReference(input.declared, input.checker, input.ts);
  if (!reference.ok) return reference;
  const shape = reference.value.shape;
  const expected = input.checker.getDeclaredTypeOfSymbol(input.target);
  if (reference.value.target !== expected)
    return { ok: false, message: 'relation target differs from the declared model type' };
  if (!compatibleShape(input.actualShape, shape))
    return {
      ok: false,
      message: 'relation result is not compatible with the declared nullability or list shape',
    };
  return { ok: true, value: shape };
};
