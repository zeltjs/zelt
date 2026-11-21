/**
 * A string that the generated schema exposes as GraphQL `ID`.
 *
 * Plain `string` stays `String`; only properties declared with this type become `ID`.
 * The optional marker preserves the underlying type, including its brands.
 */
export type ID<T extends string = string> = T & { __zeltGraphqlScalar?: 'ID' };
