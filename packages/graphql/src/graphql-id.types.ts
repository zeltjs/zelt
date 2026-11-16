/**
 * A string that the generated schema exposes as GraphQL `ID`.
 *
 * Plain `string` stays `String`; only properties declared with this type become `ID`.
 * The brand is optional, so any string can be assigned without a runtime wrapper.
 */
export type ID = string & { __zeltGraphqlScalar?: 'ID' };
