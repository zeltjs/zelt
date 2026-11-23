import 'drizzle-metadata';

declare module 'drizzle-metadata' {
  interface ColumnMetadata {
    excludedFromModel?: boolean;
    optimisticLock?: boolean;
  }

  interface RelationMetadata {
    includedInDomain?: boolean;
  }
}
