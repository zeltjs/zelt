import * as v from 'valibot';

export const GetUserInput = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
});

export const RenameUserInput = v.object({
  id: v.string(),
  name: v.string(),
  priority: v.optional(v.pipe(v.number(), v.integer())),
});
