// Service / Repository / Adapter (= Provider in spec terminology) を DI コンテナに登録するためのマーカー。
// `@Controller` は `@Injectable` を兼ねる (spec §4.7) ので Entry class に再付与する必要はない。
// @needle-di/core の `injectable` を直接 re-export すると zelt のメタデータ（トレース含む）が
// 記録されず、studio 等がソース位置を解決できないため、他デコレータと同じ経路で合成する。
import { createInjectableClassDecorator } from '../internal/index';

/** @throws {E} */
export const Injectable = () =>
  createInjectableClassDecorator({ decorator: 'Injectable' } as const, undefined, {
    unique: true,
  });
