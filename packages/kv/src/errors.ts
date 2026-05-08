export type KVErrorType = 'INVALID_TTL' | 'STORE_OPERATION_FAILED';

export class KVError extends Error {
  override readonly name = 'KVError';

  private constructor(
    readonly type: KVErrorType,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }

  static invalidTtl(ttlSec: number): KVError {
    return new KVError('INVALID_TTL', `ttlSec must be > 0, got ${ttlSec}`, { ttlSec });
  }

  static storeOperationFailed(op: string, cause: unknown): KVError {
    return new KVError(
      'STORE_OPERATION_FAILED',
      `store operation '${op}' failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { op, cause },
    );
  }
}
