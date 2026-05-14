import type { ValidatedMarker, ValidationTarget } from '@zeltjs/core';
import type { GenericSchema, InferOutput } from 'valibot';

/** @throws {Error} */
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target?: 'json',
): ValidatedMarker<InferOutput<Schema>, 'json'>;
/** @throws {Error} */
export function validated<Schema extends GenericSchema>(
  schema: Schema,
  target: 'form',
): ValidatedMarker<InferOutput<Schema>, 'form'>;
/** @throws {Error} */
export function validated<Schema extends GenericSchema>(
  _schema: Schema,
  _target: ValidationTarget = 'json',
): InferOutput<Schema> {
  throw new Error('validated() is a test fixture stub');
}
