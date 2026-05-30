import * as v from 'valibot';

export const RegisterSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
  name: v.pipe(v.string(), v.minLength(1)),
});

export const LoginSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(1)),
});

export type RegisterInput = v.InferOutput<typeof RegisterSchema>;
export type LoginInput = v.InferOutput<typeof LoginSchema>;
