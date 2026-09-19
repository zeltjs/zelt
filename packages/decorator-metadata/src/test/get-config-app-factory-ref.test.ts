import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { clearProgramCache, getConfigAppFactoryRef } from '../inspect/index';

const TSCONFIG = resolve(__dirname, '../../tsconfig.json');
const CONFIG = resolve(__dirname, './fixtures/classes/zelt.config.ts');
const RESTRICTED_TSCONFIG = resolve(__dirname, './fixtures/restricted-include/tsconfig.json');
const RESTRICTED_CONFIG = resolve(__dirname, './fixtures/restricted-include/zelt.config.ts');

describe('getConfigAppFactoryRef', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  it('resolves the dynamic-import factory call inside app: () => import(...).then((m) => m.X()) to a FunctionRef', async () => {
    const result = await getConfigAppFactoryRef(CONFIG, { tsconfig: TSCONFIG });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({
      kind: 'function',
      filePath: resolve(__dirname, './fixtures/classes/app-factory.ts'),
      name: 'createApp',
    });
  });

  it('returns undefined (not an error) when the config file has no default export or no app property', async () => {
    // mixed-classes.ts はこの形の default export を持たないフィクスチャを流用する
    const result = await getConfigAppFactoryRef(
      resolve(__dirname, './fixtures/classes/mixed-classes.ts'),
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBeUndefined();
  });

  // レビュー指摘3-b: 静的 import 経由の bare call(`import { createApp } from './app-factory';
  // ... app: () => createApp()`)を resolve できることを確認する。旧実装は
  // getSymbolAtLocation の import alias シンボルの getDeclarations()[0] が ImportSpecifier
  // ノードになり解決できなかった
  it('resolves a bare call to a statically-imported internal function to a FunctionRef', async () => {
    const result = await getConfigAppFactoryRef(
      resolve(__dirname, './fixtures/classes/zelt.config.static-import.ts'),
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({
      kind: 'function',
      filePath: resolve(__dirname, './fixtures/classes/app-factory.ts'),
      name: 'createApp',
    });
  });

  // レビュー指摘3-c: app プロパティの中の呼び出しが TypeScript 既定lib(parseInt)のみの場合、
  // internal な候補が1つも見つからず undefined を返す(default-lib への呼び出しを
  // internal と誤判定して root にしてはならない)
  it('returns undefined when the only calls inside the app property are to TypeScript default-lib declarations', async () => {
    const result = await getConfigAppFactoryRef(
      resolve(__dirname, './fixtures/classes/zelt.config.external-only.ts'),
      { tsconfig: TSCONFIG },
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBeUndefined();
  });

  it('returns SOURCE_NOT_FOUND for a file outside the program', async () => {
    const result = await getConfigAppFactoryRef(
      resolve(__dirname, './fixtures/classes/no-such.ts'),
      {
        tsconfig: TSCONFIG,
      },
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('SOURCE_NOT_FOUND');
  });

  // studio はユーザーのアプリの tsconfig をそのまま使う。zelt.config.ts は多くの場合
  // プロジェクトルート直下(src/ の外)にあり、tsconfig の "include" に含まれる保証が
  // ない(integration/ec-backend/tsconfig.json の "include": ["src/**/*", "e2e/**/*"] は
  // 実例)。ユーザーへ tsconfig の変更を要求せずに解決できることを検証する
  it('resolves a config file that the tsconfig include does not cover, without requiring the user to edit their tsconfig', async () => {
    const result = await getConfigAppFactoryRef(RESTRICTED_CONFIG, {
      tsconfig: RESTRICTED_TSCONFIG,
    });
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual({
      kind: 'function',
      filePath: resolve(__dirname, './fixtures/restricted-include/src/app-factory.ts'),
      name: 'createApp',
    });
  });
});
