export class DbError extends Error {
  override readonly name = 'DbError';

  constructor(options: { cause: unknown }) {
    super('database operation failed', options);
  }
}

export class EntityNotFoundError extends Error {
  override readonly name = 'EntityNotFoundError';

  constructor(
    readonly model: string,
    readonly id: unknown,
  ) {
    super(`${model} ${String(id)} was not found`);
  }
}

export class ConflictError extends Error {
  override readonly name = 'ConflictError';

  constructor(
    readonly model: string,
    readonly id: unknown,
  ) {
    super(`${model} ${String(id)} was changed by another process`);
  }
}

export class StagingDuplicateError extends Error {
  override readonly name = 'StagingDuplicateError';

  constructor(
    readonly model: string,
    readonly key: string,
  ) {
    super(`${model} with the same ${key} is already staged`);
  }
}
