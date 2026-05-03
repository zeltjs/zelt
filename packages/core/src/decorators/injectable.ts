// Service / Repository / Adapter (= Provider in spec terminology) を DI コンテナに登録するためのマーカー。
// `@Controller` は `@Injectable` を兼ねる (spec §4.7) ので Entry class に再付与する必要はない。
// @needle-di/core の `injectable` を Pascal-case alias として re-export する。
export { injectable as Injectable } from '@needle-di/core';
