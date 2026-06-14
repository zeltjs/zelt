import * as v from 'valibot';

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

const gqlScalarRuntimeSchema = v.object({
  kind: v.literal('zelt.graphql.scalar'),
  name: v.string(),
  codec: v.object({
    serialize: v.unknown(),
    parseValue: v.optional(v.unknown()),
  }),
});

export const parseGqlScalar = (value: unknown): AnyGqlScalar | undefined => {
  const parsed = v.safeParse(gqlScalarRuntimeSchema, value);
  if (!parsed.success) return undefined;
  return typeof parsed.output.codec.serialize === 'function' ? parsed.output : undefined;
};

export const isGqlScalar = (value: unknown): boolean => parseGqlScalar(value) !== undefined;
