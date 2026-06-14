import type { GqlOutput } from '@zeltjs/graphql';
import { gqlScalar } from '@zeltjs/graphql';

export const ProductIdScalar = gqlScalar<string>('ProductId', {
  serialize: (value) => value,
});

export type ProductId = GqlOutput<typeof ProductIdScalar>;
