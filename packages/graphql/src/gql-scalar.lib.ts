export type GqlScalarCodec<TOutput> = {
  readonly serialize: (value: TOutput) => unknown;
  readonly parseValue?: (value: unknown) => TOutput;
};

export type GqlScalar<TOutput> = {
  kind: 'zelt.graphql.scalar';
  readonly name: string;
  readonly codec: GqlScalarCodec<TOutput>;
};

export type AnyGqlScalar = {
  kind: 'zelt.graphql.scalar';
  readonly name: string;
  readonly codec: {
    readonly serialize: unknown;
    readonly parseValue?: unknown;
  };
};

export type GqlOutput<TScalar> = TScalar extends GqlScalar<infer TOutput> ? TOutput : never;

export const gqlScalar = <TOutput>(
  name: string,
  codec: GqlScalarCodec<TOutput>,
): GqlScalar<TOutput> => ({
  kind: 'zelt.graphql.scalar',
  name,
  codec,
});

const toObject = (value: unknown): object | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value;
};

const readProperty = (value: object, key: string): unknown => Reflect.get(value, key);

const parseGqlScalarName = (record: object): string | undefined => {
  const name = readProperty(record, 'name');
  return typeof name === 'string' ? name : undefined;
};

const parseGqlScalarCodec = (value: unknown): AnyGqlScalar['codec'] | undefined => {
  const codecRecord = toObject(value);
  if (!codecRecord) return undefined;

  const serialize = readProperty(codecRecord, 'serialize');
  if (typeof serialize !== 'function') return undefined;

  const parseValue = readProperty(codecRecord, 'parseValue');
  if (parseValue !== undefined && typeof parseValue !== 'function') return undefined;

  return parseValue === undefined ? { serialize } : { serialize, parseValue };
};

export const parseGqlScalar = (value: unknown): AnyGqlScalar | undefined => {
  const record = toObject(value);
  if (!record) return undefined;
  if (readProperty(record, 'kind') !== 'zelt.graphql.scalar') return undefined;

  const name = parseGqlScalarName(record);
  if (!name) return undefined;

  const codec = parseGqlScalarCodec(readProperty(record, 'codec'));
  return codec ? { kind: 'zelt.graphql.scalar', name, codec } : undefined;
};

export const isGqlScalar = (value: unknown): boolean => parseGqlScalar(value) !== undefined;
