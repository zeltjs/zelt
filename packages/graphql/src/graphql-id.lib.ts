import type { Type, TypeChecker } from 'typescript';

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
