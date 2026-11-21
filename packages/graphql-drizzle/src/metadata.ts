import 'drizzle-metadata';

declare module 'drizzle-metadata' {
  interface TableMetadata {
    /** GraphQL type name of the table. Defaults to the PascalCase export name. */
    graphqlName?: string;
    /** Keeps the table out of the GraphQL schema while relation inference still sees it. */
    graphqlHidden?: boolean;
  }

  interface ColumnMetadata {
    /** Keeps the column out of the GraphQL type. */
    graphqlHidden?: boolean;
  }
}
