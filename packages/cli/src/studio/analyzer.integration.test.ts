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
    expect(nodeOf(graph, 'LoggingMiddleware').kind).toBe('middleware');
    expect(controller.featureKey).toBe('http');

    // routes: basePath 結合済み
    expect(controller.routes).toEqual([{ method: 'GET', path: '/greeting', handler: 'greet' }]);
    expect(controller.decorators).toContain('Controller');

    // contract: instance public メソッドのみ（constructor は含まれない）
    expect(nodeOf(graph, 'GreetingService').contract).toEqual([
      { name: 'greet', params: [], returnType: 'string' },
    ]);

    // エッジ: injects 2 本 + applies-middleware 2 本
    expect(graph.edges).toContainEqual({
      from: controller.id,
      to: nodeOf(graph, 'LoggingMiddleware').id,
      kind: 'applies-middleware',
    });
    expect(graph.edges).toContainEqual({
      from: controller.id,
      to: nodeOf(graph, 'AuthMiddleware').id,
      kind: 'applies-middleware',
      methods: ['greet'],
    });
    expect(graph.edges).toContainEqual({
      from: controller.id,
      to: nodeOf(graph, 'GreetingService').id,
      kind: 'injects',
    });
    expect(graph.edges).toHaveLength(4);
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
