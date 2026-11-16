/** A checked meaning, or why the written form cannot have one. */
export type Result<T> =
  | { kind: 'ok'; readonly value: T }
  | { kind: 'rejected'; readonly reason: string };

/** Reading one user-written form: it is not that form at all, or it is and checks as a Result. */
export type Read<T> = Result<T> | { kind: 'absent' };

export const ok = <T>(value: T): Result<T> => ({ kind: 'ok', value });
export const rejected = (reason: string): Result<never> => ({ kind: 'rejected', reason });
export const absent: Read<never> = { kind: 'absent' };

export const andThen = <T, U>(result: Result<T>, next: (value: T) => Result<U>): Result<U> =>
  result.kind === 'ok' ? next(result.value) : result;
