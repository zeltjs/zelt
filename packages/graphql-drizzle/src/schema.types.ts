export type ModelColumn = {
  readonly key: string;
  readonly property: string;
};

export type ModelRelation = {
  readonly key: string;
  readonly target: string;
  readonly targetExport: string;
  readonly targetPrimaryKey: string;
  readonly joins: readonly { readonly source: string; readonly target: string }[];
} & ({ kind: 'many' } | { kind: 'one'; readonly nullable: boolean });

export type Model = {
  readonly name: string;
  readonly exportName: string;
  readonly rowName: string;
  readonly dialect: 'pg' | 'sqlite';
  readonly primaryKey: string;
  readonly columns: readonly ModelColumn[];
  readonly relations: readonly ModelRelation[];
};

export type SchemaResult = { kind: 'success'; readonly models: readonly Model[] } | SchemaError;

export type SchemaError = { kind: 'error'; readonly message: string };

export type ReadResult<T> = { kind: 'success'; readonly value: T } | SchemaError;
