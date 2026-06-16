import * as v from 'valibot';

export const NodeGetUserInput = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
});
