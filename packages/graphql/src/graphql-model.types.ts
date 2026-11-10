export type GraphqlModelScalar = 'ID' | 'string' | 'number' | 'boolean';

export type GraphqlModelBinding = {
  readonly resolver: string;
  readonly method: string;
};

export type GraphqlModelValue =
  | { kind: 'scalar'; readonly name: GraphqlModelScalar }
  | { kind: 'array'; readonly item: GraphqlModelValue }
  | { kind: 'nullable'; readonly inner: GraphqlModelValue }
  | { kind: 'optional'; readonly inner: GraphqlModelValue }
  | { kind: 'opaque' };

export type GraphqlModelProperty = {
  readonly name: string;
  readonly optional: boolean;
  readonly value: GraphqlModelValue;
};

/**
 * `properties` are the values a reference is hydrated with. An identity model has no provider,
 * so only its `id` is known and every other field is resolved from that id.
 */
export type GraphqlModelDefinition =
  | {
      kind: 'identity';
      readonly properties: readonly GraphqlModelProperty[];
    }
  | {
      kind: 'provided';
      readonly provider: GraphqlModelBinding;
      readonly mode: 'single' | 'batch';
      readonly properties: readonly GraphqlModelProperty[];
    };

export type GraphqlModelResultShape =
  | { kind: 'one'; readonly nullable: boolean }
  | { kind: 'many'; readonly nullable: boolean; readonly itemNullable: boolean };

export type GraphqlModelField =
  | {
      kind: 'query';
      readonly target: string;
      readonly shape: GraphqlModelResultShape;
    }
  | {
      kind: 'relation';
      readonly target: string;
      readonly shape: GraphqlModelResultShape;
      readonly dependencies: readonly string[];
      readonly mode: 'single' | 'batch';
    }
  | {
      kind: 'computed';
      readonly dependencies: readonly string[];
      readonly mode: 'single' | 'batch';
      readonly value: GraphqlModelValue;
    };

export type GraphqlModels = Readonly<Record<string, GraphqlModelDefinition>>;
export type GraphqlModelFields = Readonly<
  Record<string, Readonly<Record<string, GraphqlModelField>>>
>;
