import { createClassDecorator, createMethodDecorator } from '../../../index';

// Marker/ClassMarker: `@RateLimit` (別パッケージで `UseMiddleware(RateLimitMiddleware, opts)`
// を呼ぶだけの decorator ファクトリ)を模した fixture。呼び出し元(multi-marker.ts)とは
// 別ファイルに置くことで、実運用(rate-limit.middleware.ts が auth.controller.ts とは
// 別パッケージにある)と同じ「ファクトリの定義ファイル ≠ 適用ファイル」の形にする
/** @throws {E} */
export const Marker = (target: string) => createMethodDecorator({ kind: 'marker', target });
/** @throws {E} */
export const ClassMarker = (target: string) => createClassDecorator({ kind: 'marker', target });
