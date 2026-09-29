import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * decorator metadata は module ごとの WeakMap に入るので、app が読み込んだのと
 * 同じ instance でないと記録が空に見える。CLI 側の copy ではなく、app の位置から
 * 解決した ESM entry を動的 import するために、その URL をここで求める。
 */

const packageJsonOf = (dir: string): { readonly name?: unknown; readonly exports?: unknown } => {
  const parsed: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  return typeof parsed === 'object' && parsed !== null ? parsed : {};
};

/** @throws {Error} when the package that owns `file` cannot be found */
const packageRootOf = (file: string, name: string): string => {
  let dir = dirname(file);
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'package.json')) && packageJsonOf(dir).name === name) return dir;
    dir = dirname(dir);
  }
  throw new Error(`cannot find the package root of ${name} above ${file}`);
};

const at = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const importEntryOf = (exports: unknown, subpath: string): string | undefined => {
  const entry = at(at(at(exports, subpath), 'import'), 'default');
  return typeof entry === 'string' ? entry : undefined;
};

/**
 * `from` から見た package の ESM entry を URL で返す。
 * require の解決は exports の `require` 条件(CJS)を指すため、package.json の
 * `import` 条件を読み直して ESM 側に合わせる。
 *
 * @throws {Error} when the package or its ESM entry cannot be resolved
 */
export const esmEntryUrlFrom = (from: string, name: string, subpath: string): string => {
  const specifier = subpath === '.' ? name : `${name}${subpath.slice(1)}`;
  const required = createRequire(from).resolve(specifier);
  const root = packageRootOf(required, name);
  const entry = importEntryOf(packageJsonOf(root).exports, subpath);
  if (entry === undefined) {
    throw new Error(`${name} does not expose an ESM entry for ${subpath}`);
  }
  return pathToFileURL(resolve(root, entry)).href;
};
