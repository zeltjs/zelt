/** A string whose GraphQL scalar is explicitly ID. No runtime wrapper is required. */
export type ID = string & { __zeltGraphqlScalar?: 'ID' };
