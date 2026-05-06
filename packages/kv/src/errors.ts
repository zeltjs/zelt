export class KVError extends Error {
  override name = 'KVError';
}

export class UnsupportedOperationError extends KVError {
  override name = 'UnsupportedOperationError';
}

export class MinTtlError extends KVError {
  override name = 'MinTtlError';
}

export class MinPrefixLengthError extends KVError {
  override name = 'MinPrefixLengthError';

  constructor() {
    super('namespace prefix must not be empty');
  }
}
