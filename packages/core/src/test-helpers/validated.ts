import { HTTPException } from 'hono/http-exception';
import { safeParse } from 'valibot';
import type { GenericSchema, InferOutput } from 'valibot';

import { getEntryContext } from '../runtime/index';
import type { ValidatedMarker, ValidationTarget } from '../primitives/validated-types';

export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target?: 'json',
): ValidatedMarker<InferOutput<Schema>, 'json'>;
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target: 'form',
): ValidatedMarker<InferOutput<Schema>, 'form'>;
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target: ValidationTarget = 'json',
): InferOutput<Schema> {
  const ctx = getEntryContext();
  const body = target === 'json' ? ctx.input.jsonBody : ctx.input.formBody;
  const result = safeParse(schema, body);
  if (!result.success) {
    throw new HTTPException(400, {
      res: Response.json({ code: 'VALIDATION_FAILED', issues: result.issues }, { status: 400 }),
    });
  }
  return result.output;
}
