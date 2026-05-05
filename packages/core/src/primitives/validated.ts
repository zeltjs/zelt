import { HTTPException } from 'hono/http-exception';
import { safeParse, type GenericSchema, type InferOutput } from 'valibot';

import { getEntryContext } from '../internal/entry-context';

// 型レベル marker。@zeltjs/openapi が handler signature から validated() 引数を検出するために使う。
// runtime 値は parse 結果そのもので、brand は phantom (compile time only)。
declare const __zeltValidatedBrand: unique symbol;
// __zeltValidatedType は T を phantom field として保持し、conditional type の infer で
// 自己参照交差型を避けて安全に T を取り出せるようにするためのタグ。
declare const __zeltValidatedType: unique symbol;

export type ValidatedMarker<T> = T & {
  [__zeltValidatedBrand]: true;
  [__zeltValidatedType]: T;
};

// Extracts T from ValidatedMarker<T> by reading the phantom [__zeltValidatedType] key.
// Defined in @zeltjs/core (same module as the symbols) so that the lookup is a simple
// property access, avoiding complex cross-module conditional type inference.
export type ExtractValidated<H> =
  NonNullable<H> extends Record<typeof __zeltValidatedType, infer T> ? T : never;

// Returns true if NonNullable<H> contains the [__zeltValidatedBrand] marker.
export type IsValidated<H> =
  NonNullable<H> extends Record<typeof __zeltValidatedBrand, true> ? true : false;

// Public overload returns the branded type so contract analyzer can detect it.
// Implementation signature returns the underlying parsed value; the brand is
// erased at runtime (it's a phantom optional symbol field).
export function validated<Schema extends GenericSchema>(
  schema: Schema,
): ValidatedMarker<InferOutput<Schema>>;
export function validated<Schema extends GenericSchema>(schema: Schema): InferOutput<Schema> {
  const ctx = getEntryContext();
  const result = safeParse(schema, ctx.input.body);
  if (!result.success) {
    throw new HTTPException(400, {
      res: Response.json({ code: 'VALIDATION_FAILED', issues: result.issues }, { status: 400 }),
    });
  }
  return result.output;
}
