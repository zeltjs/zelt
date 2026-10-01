// hono は HTTP 層からしか参照されない。DI だけを使う bundle に残っていれば tree shaking が壊れている。
export const FORBIDDEN_SPECIFIER = /^hono(\/|$)/;

// 静的 import / export-from / 副作用 import / 動的 import() / require() の文字列リテラルを拾う。
// rolldown の chunk.imports は動的 import や require を取りこぼすため、出力コードを直接検査する。
const SPECIFIER_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

export const findSpecifiers = (code) =>
  [
    ...new Set(
      SPECIFIER_PATTERNS.flatMap((pattern) => [...code.matchAll(pattern)].map((match) => match[1])),
    ),
  ].sort();

export const findForbiddenSpecifiers = (code) =>
  findSpecifiers(code).filter((id) => FORBIDDEN_SPECIFIER.test(id));

// DI だけを使う CLI 利用者の再現。built-in の @Injectable サービスを実際に解決し、
// sideEffects: false の宣言でデコレータのメタデータ登録が落ちていないことを実行で確かめる。
export const DI_ONLY_CONSUMER_SOURCE = `
import { createApp, LoggerService, PrettyFormatter, Env, CliConfig, WaitUntilAdaptor } from '@zeltjs/core';
const runtime = await createApp([]).createRuntime();
for (const cls of [LoggerService, PrettyFormatter, Env, CliConfig, WaitUntilAdaptor]) {
  if (!(await runtime.get(cls) instanceof cls)) throw new Error(cls.name + ' was not resolved');
}
const formatter = await runtime.get(PrettyFormatter);
if (!formatter.format({ level: 'info', message: 'test', timestamp: '2026-01-01T00:00:00Z', context: {} }).includes('test')) {
  throw new Error('PrettyFormatter metadata was not retained');
}
const logger = await runtime.get(LoggerService);
if (typeof logger.child !== 'function') throw new Error('LoggerService was not resolved');
await runtime.shutdown();
`;


// imports だけでは、bundle 内へ取り込まれた Hono を検出できない。
export const findBundledHonoModules = (output) => [...new Set(output
  .filter((chunk) => chunk.type === 'chunk')
  .flatMap((chunk) => Object.entries(chunk.modules))
  .filter(([id, module]) => /[/\\]node_modules[/\\]hono[/\\]/.test(id) && module.renderedLength > 0)
  .map(([id]) => id))].sort();


export const findBundledCronerModules = (output) => [...new Set(output
  .filter((chunk) => chunk.type === 'chunk')
  .flatMap((chunk) => Object.entries(chunk.modules))
  .filter(([id, module]) => (/[/\\]node_modules[/\\]croner[/\\]/.test(id) ||
    /[/\\]dist[/\\]scheduler-runtime-[^/\\]+\.(?:js|cjs)$/.test(id)) && module.renderedLength > 0)
  .map(([id]) => id))].sort();
