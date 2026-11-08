import type { Type, TypeChecker } from 'typescript';
import type { GraphqlOutputTypeInfo } from './type-to-graphql.lib';

export const isGraphqlIdType = (type: Type, checker: TypeChecker): boolean => {
  const marker = type.getProperty('__zeltGraphqlScalar');
  const declaration = marker?.declarations?.[0];
  if (!marker || !declaration) return false;
  const value = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(marker, declaration));
  return (
    value.isStringLiteral() &&
    value.value === 'ID' &&
    checker.isTypeAssignableTo(type, checker.getStringType())
  );
};

export const graphqlIdOutput = (
  type: Type,
  checker: TypeChecker,
  ts: typeof import('typescript'),
): GraphqlOutputTypeInfo | undefined => {
  if (isGraphqlIdType(type, checker)) return { kind: 'graphqlBuiltinScalar', name: 'ID' };
  if (!type.isUnion()) return undefined;
  const ids = type.types.filter((member) => isGraphqlIdType(member, checker));
  if (ids.length !== 1) return undefined;
  const nullish = type.types.filter(
    (member) => member.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined),
  );
  if (ids.length + nullish.length !== type.types.length) return undefined;
  return {
    kind: 'union',
    types: [
      { kind: 'graphqlBuiltinScalar', name: 'ID' },
      ...nullish.map(
        (member): GraphqlOutputTypeInfo => ({
          kind: 'primitive',
          type: member.flags & ts.TypeFlags.Null ? 'null' : 'undefined',
        }),
      ),
    ],
  };
};
