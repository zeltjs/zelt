// zelt studio の解析子プロセス。tsx で実行され、ユーザーの app をロードして
// 依存グラフ JSON をマーカー行で親プロセスへ渡す。realize() は呼ばない。
import { relative, resolve } from 'node:path';
import {
  getClassMetadata,
  getDependenciesFromSource,
  getSourcePosition,
} from '@zeltjs/decorator-metadata/inspect';
import consola from 'consola';

import { loadZeltConfig } from '../config/index';
import type { AppLike, InspectableClass } from './analyzer.lib';
import { extractDecoratorNames, isAppLike } from './analyzer.lib';
import { GRAPH_MARKER } from './analyzer-protocol';
import type { DependencyResolver, GraphRoot } from './graph/index';
import { buildDependencyGraph, decoratorsToKind } from './graph/index';

const decoratorNamesFromMetadata = (cls: InspectableClass): readonly string[] =>
  extractDecoratorNames(getClassMetadata(cls)?.props ?? []);

const rootFromClass =
  (cwd: string, featureKey: string) =>
  (cls: InspectableClass): GraphRoot => {
    const pos = getSourcePosition(cls);
    return {
      className: cls.name,
      filePath: pos ? relative(cwd, pos.sourceFile) : undefined,
      kind: decoratorsToKind(decoratorNamesFromMetadata(cls)),
      featureKey,
    };
  };

const collectRoots = (app: AppLike, cwd: string): readonly GraphRoot[] =>
  app.features.flatMap((feature) => feature.featureClasses().map(rootFromClass(cwd, feature.key)));

/**
 * @throws {Error} from analyzer-entry.ts:loadApp
 * @throws {ZeltConfigLoadError} from config-loader.lib.ts:loadZeltConfig
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

/**
 * @throws {Error} from analyzer-entry.ts:createResolveDependencies
 * @throws {UnsupportedTypeScriptVersionError} from resolve-typescript.lib.ts:resolveTypeScript
 */
const createResolveDependencies =
  (cwd: string, tsconfig: string): DependencyResolver =>
  async (filePath, className) => {
    const result = await getDependenciesFromSource(resolve(cwd, filePath), className, {
      tsconfig,
    });
    if (result.isOk()) {
      return {
        kind: 'resolved',
        deps: result.value.map((dep) => ({
          className: dep.className,
          filePath: relative(cwd, dep.sourceFile),
          decorators: dep.decorators,
        })),
      };
    }
    if (result.error.code === 'SOURCE_NOT_FOUND' || result.error.code === 'POSITION_INVALID') {
      // そのクラスだけ解析不能。握り潰さず理由を stderr に残して unresolved にする
      consola.error(`[zelt studio] unresolved ${className}: ${result.error.message}`);
      return { kind: 'unresolved' };
    }
    // tsconfig / TS program の異常は全ノードに波及するので fatal
    throw new Error(`${result.error.code}: ${result.error.message}`);
  };

/**
 * @throws {Error} from analyzer-entry.ts:createResolveDependencies
 * @throws {UnsupportedTypeScriptVersionError} from resolve-typescript.lib.ts:resolveTypeScript
 * @throws {Error} from analyzer-entry.ts:loadApp
 * @throws {ZeltConfigLoadError} from config-loader.lib.ts:loadZeltConfig
 * @throws {ZeltConfigLoadError} from config-loader.lib.ts:loadZeltConfig
 */
const main = async (): Promise<void> => {
  const cwd = process.cwd();
  const app = await loadApp(cwd, process.argv[2]);

  const tsconfig = resolve(cwd, 'tsconfig.json');
  const graph = await buildDependencyGraph(
    collectRoots(app, cwd),
    createResolveDependencies(cwd, tsconfig),
  );
  process.stdout.write(`${GRAPH_MARKER}${JSON.stringify(graph)}\n`);
};

main().catch((error: unknown) => {
  consola.error(error);
  process.exitCode = 1;
});
