import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runAnalyzer } from './analyzer-runner.lib';
import type { DependencyGraph, GraphNode } from './graph/index';

const FIXTURE_DIR = resolve(__dirname, '../../test-fixtures/studio-app');
const ANALYZER_SRC = resolve(__dirname, './analyzer-entry.ts');

// optional chaining の連鎖は ESLint complexity にカウントされるため、
// 見つからなければ throw するルックアップに寄せて分岐を減らす
const nodeOf = (graph: DependencyGraph, className: string): GraphNode => {
  const node = graph.nodes.find((n) => n.className === className);
  if (!node) throw new Error(`node not found in graph: ${className}`);
  return node;
};

describe('studio analyzer (integration)', () => {
  it('builds the v2 dependency graph of the fixture app', async () => {
    const result = await runAnalyzer({ cwd: FIXTURE_DIR, analyzerPath: ANALYZER_SRC });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { graph } = result;

    const classNames = graph.nodes.map((n) => n.className).sort();
    expect(classNames).toEqual([
      'AuthMiddleware',
      'ClockService',
      'GreetingController',
      'GreetingService',
      'LoggingMiddleware',
    ]);

    const controller = nodeOf(graph, 'GreetingController');
    expect(controller.kind).toBe('controller');
    expect(controller.featureKey).toBe('http');

    // routes: basePath 結合済み
    expect(controller.routes).toEqual([{ method: 'GET', path: '/greeting', handler: 'greet' }]);
    expect(controller.decorators).toContain('Controller');

    // contract: instance public メソッドのみ（constructor は含まれない）
    expect(nodeOf(graph, 'GreetingService').contract).toEqual([
      { name: 'greet', params: [], returnType: 'string' },
    ]);

    // middleware ノード: @Middleware は直付け型デコレータ (factory を介さない) のため、
    // 実ファイルへの解決経路が factory 型と異なる。filePath が実体を指し、unresolved が
    // 付かないこと、use メソッドの契約が取れていることを検証する
    const loggingMiddleware = nodeOf(graph, 'LoggingMiddleware');
    expect(loggingMiddleware.kind).toBe('middleware');
    expect(loggingMiddleware.filePath).toBe('src/logging.middleware.ts');
    expect(loggingMiddleware.unresolved).toBeUndefined();
    expect(loggingMiddleware.contract).toEqual([
      {
        name: 'use',
        // Next<T = void> is a conditional type since the middleware-values
        // change; TS resolves the default application eagerly and drops the
        // alias, so the analyzer sees the expanded shape. Restoring the alias
        // name in the graph is tracked as a separate studio improvement.
        params: [{ name: 'next', type: '() => Promise<void>' }],
        returnType: 'Promise<Response | undefined>',
      },
    ]);

    const authMiddleware = nodeOf(graph, 'AuthMiddleware');
    expect(authMiddleware.filePath).toBe('src/auth.middleware.ts');
    expect(authMiddleware.unresolved).toBeUndefined();

    // エッジ: injects 3 本 (GreetingController→GreetingService, GreetingService→ClockService,
    // LoggingMiddleware→ClockService) + applies-middleware 2 本
    expect(graph.edges).toContainEqual({
      from: controller.id,
      to: loggingMiddleware.id,
      kind: 'applies-middleware',
    });
    expect(graph.edges).toContainEqual({
      from: controller.id,
      to: authMiddleware.id,
      kind: 'applies-middleware',
      methods: ['greet'],
    });
    expect(graph.edges).toContainEqual({
      from: controller.id,
      to: nodeOf(graph, 'GreetingService').id,
      kind: 'injects',
    });
    // middleware の inject 依存も BFS キューで展開されること (spec の必須要件)
    expect(graph.edges).toContainEqual({
      from: loggingMiddleware.id,
      to: nodeOf(graph, 'ClockService').id,
      kind: 'injects',
    });
    expect(graph.edges).toHaveLength(5);
    expect(graph.version).toBe(2);
  }, 60_000);

  it('reports load errors via errorOutput', async () => {
    const result = await runAnalyzer({
      cwd: FIXTURE_DIR,
      analyzerPath: ANALYZER_SRC,
      configFile: 'no-such-config.ts',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorOutput.length).toBeGreaterThan(0);
  }, 60_000);

  it('propagates user-code import errors via errorOutput instead of crashing', async () => {
    // broken fixture: app loader が存在しないモジュールを import する
    const result = await runAnalyzer({
      cwd: resolve(__dirname, '../../test-fixtures/studio-app-broken'),
      analyzerPath: ANALYZER_SRC,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorOutput).toContain('no-such-module');
  }, 60_000);
});
