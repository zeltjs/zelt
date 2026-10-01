import { isMatching, P } from 'ts-pattern';

export type MethodContext = {
  kind: 'method';
  readonly metadata?: NonNullable<unknown>;
  readonly static?: boolean;
  readonly name?: string | symbol;
};
export type FieldContext = Omit<MethodContext, 'kind'> & { kind: 'field' };

const classContextPattern = {
  kind: 'class' as const,
  metadata: P.optional(P.nonNullable),
};

const methodContextPattern: P.Pattern<MethodContext> = {
  kind: 'method' as const,
  metadata: P.optional(P.nonNullable),
  static: P.optional(P.boolean),
  name: P.optional(P.union(P.string, P.symbol)),
};

const fieldContextPattern: P.Pattern<FieldContext> = {
  kind: 'field' as const,
  metadata: P.optional(P.nonNullable),
  static: P.optional(P.boolean),
  name: P.optional(P.union(P.string, P.symbol)),
};

// Use the same validators without allocating a fluent match chain for each application.
export const isClassContext = (value: unknown) => isMatching(classContextPattern, value);
export const isMethodContext = (value: unknown) => isMatching(methodContextPattern, value);
export const isFieldContext = (value: unknown) => isMatching(fieldContextPattern, value);
