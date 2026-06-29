export type RateLimitOptions = {
  limit: number;
  windowSec: number;
  /** 静的 key、または entry context 内で評価される関数 */
  key: string | (() => string | Promise<string>);
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSec: number;
};
