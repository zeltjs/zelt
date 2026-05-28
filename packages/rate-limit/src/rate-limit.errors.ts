export type RateLimitError = { type: 'KV_FAILED'; cause: unknown; message: string };

export const kvFailed = (cause: unknown): RateLimitError => ({
  type: 'KV_FAILED',
  cause,
  message: `rate-limit KV operation failed: ${cause instanceof Error ? cause.message : String(cause)}`,
});
