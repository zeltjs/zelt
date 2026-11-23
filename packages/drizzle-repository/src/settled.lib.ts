import { err, ok, ResultAsync } from 'neverthrow';

// A repository method returns every failure as a value. The engine settles its work into this
// shape inside one try block, so nothing it throws reaches the caller.
export type Settled<T, E> = { ok: true; readonly value: T } | { ok: false; readonly error: E };

export const succeeded = <T>(value: T): Settled<T, never> => ({ ok: true, value });

export const failed = <E>(error: E): Settled<never, E> => ({ ok: false, error });

export const toResultAsync = <T, E>(settled: Promise<Settled<T, E>>): ResultAsync<T, E> =>
  ResultAsync.fromSafePromise(settled).andThen((result) =>
    result.ok ? ok(result.value) : err(result.error),
  );
