// zelt studio の解析子プロセス。tsx で実行され、ユーザーの app をロードして
// 依存グラフ JSON をマーカー行で親プロセスへ渡す。realize() は呼ばない。

// c12(jiti) が独自キャッシュで app を評価すると、getClassSource が native import で
// 引くモジュールとクラスが別インスタンスになり identity 逆引きが壊れる(かつ app が
// 二重評価される)。tsx 配下では native import が TS を扱えるため jiti に native を優先させる
process.env['JITI_TRY_NATIVE'] ??= 'true';

import { relative, resolve } from 'node:path';
import type { ClassSource } from '@zeltjs/decorator-metadata/inspect';
import {
  getClassMetadata,
  getClassSource,
  getDependencySources,
  resolveClassSource,
} from '@zeltjs/decorator-metadata/inspect';
import consola from 'consola';

import { loadZeltConfig } from '../config/index';
import type { AppLike, InspectableClass } from './analyzer.lib';
import { extractDecoratorNames, isAppLike } from './analyzer.lib';
import { GRAPH_MARKER } from './analyzer-protocol';
import type { DependencyResolution, DependencyResolver, GraphRoot } from './graph/index';
import { buildDependencyGraph, decoratorsToKind } from './graph/index';

const decoratorNamesFromMetadata = (cls: InspectableClass): readonly string[] =>
  extractDecoratorNames(getClassMetadata(cls)?.props ?? []);

const rootFromClass =
  (featureKey: string) =>
  async (cls: InspectableClass): Promise<GraphRoot> => {
    const source = await getClassSource(cls);
    if (source.isErr()) {
      // 位置を特定できない root は unresolved 表示になる。原因は stderr に残す
      consola.error(`[zelt studio] no ClassSource for ${cls.name}: ${source.error.message}`);
    }
    return {
      className: cls.name,
      source: source.isOk() ? source.value : undefined,
      kind: decoratorsToKind(decoratorNamesFromMetadata(cls)),
      featureKey,
    };
  };

const collectRoots = (app: AppLike): Promise<GraphRoot[]> =>
  Promise.all(
    app.features.flatMap((feature) => feature.featureClasses().map(rootFromClass(feature.key))),
  );

/**
 * @throws {Error} from analyzer-entry.ts:loadApp
 * @throws {ZeltConfigLoadError} from config-loader.lib.ts:loadZeltConfig
 */
const loadApp = async (cwd: string, configFile: string | undefined): Promise<AppLike> => {
  const config = await loadZeltConfig(configFile !== undefined ? { cwd, configFile } : { cwd });
  const app: unknown = await config.app();
  if (!isAppLike(app)) {
    throw new Error(
      'config.app() did not return a zelt app (missing features array). Check zelt.config.ts',
    );
  }
  return app;
};

// 依存クラスの kind 判定用デコレータ名。ClassSource は正準化済みなので
// resolveClassSource はキャッシュ済みモジュールの export を引くだけで副作用はない
const dependencyDecorators = async (source: ClassSource): Promise<readonly string[]> => {
  const cls = await resolveClassSource(source);
  return cls.isOk() ? extractDecoratorNames(getClassMetadata(cls.value)?.props ?? []) : [];
};

/**
 * @throws {Error} from analyzer-entry.ts:createResolveDependencies
 * @throws {UnsupportedTypeScriptVersionError} from resolve-typescript.lib.ts:resolveTypeScript
 */
const createResolveDependencies =
  (tsconfig: string): DependencyResolver =>
  async (source) => {
    const result = await getDependencySources(source, { tsconfig });
    if (result.isErr()) {
      // program 外のソース（node_modules 等）は展開対象外の葉として扱う
      if (result.error.code === 'SOURCE_NOT_FOUND') return { kind: 'external' };
      if (result.error.code === 'POSITION_INVALID') {
        // そのクラスだけ解析不能。握り潰さず理由を stderr に残して unresolved にする
        consola.error(`[zelt studio] unresolved ${source.exportName}: ${result.error.message}`);
        return { kind: 'unresolved' };
      }
      // tsconfig / TS program の異常は全ノードに波及するので fatal
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
    const deps: DependencyResolution[] = await Promise.all(
      result.value.map(async (dep): Promise<DependencyResolution> => {
        if (dep.kind === 'unresolved') {
          consola.error(`[zelt studio] unresolved ${dep.localName}: ${dep.reason}`);
          return { kind: 'unresolved', localName: dep.localName };
        }
        return {
          kind: 'class',
          source: dep.source,
          decorators: await dependencyDecorators(dep.source),
        };
      }),
    );
    return { kind: 'resolved', deps };
  };

/**
 * @throws {Error} from analyzer-entry.ts:createResolveDependencies
 * @throws {UnsupportedTypeScriptVersionError} from resolve-typescript.lib.ts:resolveTypeScript
 * @throws {Error} from analyzer-entry.ts:loadApp
 * @throws {ZeltConfigLoadError} from config-loader.lib.ts:loadZeltConfig
 */
const main = async (): Promise<void> => {
  const cwd = process.cwd();
  const app = await loadApp(cwd, process.argv[2]);

  const tsconfig = resolve(cwd, 'tsconfig.json');
  const graph = await buildDependencyGraph(
    await collectRoots(app),
    createResolveDependencies(tsconfig),
    { formatPath: (filePath) => relative(cwd, filePath) },
  );
  process.stdout.write(`${GRAPH_MARKER}${JSON.stringify(graph)}\n`);
};

main().catch((error: unknown) => {
  consola.error(error);
  process.exitCode = 1;
});
