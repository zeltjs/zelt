import type { StandardSchemaV1 } from '@standard-schema/spec';

export const NodeGetUserInput: StandardSchemaV1<
  Readonly<Record<string, unknown>>,
  { readonly id: string }
>;
