import { access } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { GenerateClientOptions } from './config/options';

const DEFAULT_CONFIG_NAMES = [
  'koya.config.ts',
  'koya.config.js',
  'koya.config.mts',
  'koya.config.mjs',
] as const;

const exists = async (p: string): Promise<boolean> =>
  // access throws on missing — resolve to true/false rather than rejecting
  // so callers don't need try/catch (no-try-catch rule applies here)
  access(p).then(
    () => true,
    () => false,
  );

export const findConfigFile = async (cwd: string): Promise<string | undefined> => {
  for (const name of DEFAULT_CONFIG_NAMES) {
    const p = resolve(cwd, name);
    if (await exists(p)) return p;
  }
  return undefined;
};

// dynamic import 由来の `unknown` を GenerateClientOptions に橋渡しする。
// 公開 overload は unknown を受け取り impl で返却するだけ。
// generateClient() が構造を検証するためここでは trust する。
// (json-schema-input.ts の narrowToValibotSchema と同じ pattern)
function narrowConfig(value: unknown): GenerateClientOptions;
function narrowConfig(value: unknown): unknown {
  return value;
}

// dynamic import の戻り値は any 扱い (TS 仕様) — unknown 経由で扱う
const dynamicImport = async (url: string): Promise<unknown> => import(url);

export const loadConfig = async (path: string): Promise<GenerateClientOptions> => {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  const url = pathToFileURL(abs).href;
  const mod = await dynamicImport(url);
  if (typeof mod !== 'object' || mod === null) {
    throw new Error(`koya/contract: ${path} must export a default GenerateClientOptions object`);
  }
  // Spread into Record to access named exports without in-operator or type predicate.
  // Pattern from emit/json-schema-input.ts importNamedExport.
  const namespace: Record<string, unknown> = { ...mod };
  const defaultKey = 'default';
  const cfg = namespace[defaultKey];
  if (cfg === undefined) {
    throw new Error(`koya/contract: ${path} must export a default GenerateClientOptions object`);
  }
  return narrowConfig(cfg);
};
