import { parse, type GenericSchema, type InferOutput } from 'valibot';

import { getEntryContext } from '../internal/entry-context';

export const validated = <Schema extends GenericSchema>(schema: Schema): InferOutput<Schema> => {
  const ctx = getEntryContext();
  return parse(schema, ctx.input.body);
};
