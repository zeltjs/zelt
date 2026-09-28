import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runAnalyzer } from './analyzer-runner.lib';
import type { DependencyGraph, EntryInfo, FnNode, GraphNodeV3 } from './graph/index';
import { isExternalNode } from './graph/index';

// 判別共用体 GraphNodeV3 の絞り込み。in演算子・型述語・as を使わず、読みたい optional
// プロパティだけを宣言した型へ代入する。プロダクションコードは ts-pattern の match で
// 分岐する(レビュー指摘13)ため、この手法はテストからしか使わない
type NodeFields = {
  readonly kind?: string;
  readonly name?: string;
  readonly entry?: EntryInfo;
  readonly contract?: FnNode['contract'];
  readonly visibility?: FnNode['visibility'];
  // 値は読まない。共用体の全メンバと 1 つ以上プロパティを共有しないと weak type detection が
  // 代入を拒むため、他の欄を持たない ExternalNode のための一欄を宣言しておく
  external?: true;
};

const fieldsOf = (n: GraphNodeV3): NodeFields => n;
const isClassNode = (n: GraphNodeV3): boolean => fieldsOf(n).kind === 'class';
const isFnNode = (n: GraphNodeV3): boolean => !isClassNode(n) && !isExternalNode(n);

const FIXTURE_DIR = resolve(__dirname, '../../../studio-extract/test-fixtures/studio-app');
const ANALYZER_SRC = resolve(__dirname, './analyzer-entry.ts');

const nodeById = (graph: DependencyGraph, id: string): GraphNodeV3 => {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`node not found in graph: ${id}`);
  return node;
};

describe('studio analyzer (integration)', () => {
  it('builds the v3 dependency graph of the fixture app', async () => {
    const result = await runAnalyzer({ cwd: FIXTURE_DIR, analyzerPath: ANALYZER_SRC });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { graph } = result;

    expect(graph.version).toBe(3);
    expect(graph.tests).toEqual([]);

    const classNames = graph.nodes
      .filter(isClassNode)
      .map((n) => fieldsOf(n).name)
      .sort();
    expect(classNames).toEqual([
      'AuditMiddleware',
      'AuthMiddleware',
      'ClockService',
      'GreetingConfig',
      'GreetingController',
      'GreetingService',
      'LoggingMiddleware',
      'NotificationHandler',
    ]);

    // entry: http
    const greet = nodeById(graph, 'src/greeting.controller.ts#GreetingController.greet');
    expect(fieldsOf(greet).entry).toEqual({ kind: 'http', method: 'GET', path: '/greeting' });
    expect(fieldsOf(greet).contract).toEqual({ params: [], returnType: '{ message: string; }' });

    // entry: middleware(class-level 適用の LoggingMiddleware、グローバル適用の AuditMiddleware 両方)
    expect(
      fieldsOf(nodeById(graph, 'src/logging.middleware.ts#LoggingMiddleware.use')).entry,
    ).toEqual({
      kind: 'middleware',
      name: 'LoggingMiddleware',
    });
    expect(fieldsOf(nodeById(graph, 'src/audit.middleware.ts#AuditMiddleware.use')).entry).toEqual({
      kind: 'middleware',
      name: 'AuditMiddleware',
    });

    // get accessor も FnNode になる(設計判断メモ12)
    const prefix = nodeById(graph, 'src/greeting.config.ts#GreetingConfig.prefix');
    expect(fieldsOf(prefix).contract).toEqual({ params: [], returnType: 'string' });

    // クロスファイルのモジュール関数呼び出し: time.lib.ts の formatTime が新規発見される
    const formatTime = nodeById(graph, 'src/time.lib.ts#formatTime');
    expect(fieldsOf(formatTime).visibility).toBe('public'); // export 有りなので public(設計判断メモ1)

    const greetServiceGreet = nodeById(graph, 'src/greeting.service.ts#GreetingService.greet');
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ kind: 'calls', from: greetServiceGreet.id, to: formatTime.id }),
    );

    // 外部パッケージ呼び出し: node:crypto の randomUUID が ExternalNode になる
    const externalIds = graph.nodes.filter(isExternalNode).map((n) => n.id);
    expect(externalIds).toContain('ext:node:crypto#randomUUID');
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        kind: 'calls',
        from: greetServiceGreet.id,
        to: 'ext:node:crypto#randomUUID',
      }),
    );

    // AuditMiddleware はグローバル middleware のため applies-middleware エッジを持たない
    expect(
      graph.edges.filter(
        (e) => e.kind === 'applies-middleware' && e.to.includes('AuditMiddleware'),
      ),
    ).toEqual([]);

    // applies-middleware の line は @UseMiddleware(...) の実際の行と一致する(team-lead 決定の
    // 検証: build-graph.lib.ts が getClassDeclarations/getFunctionDeclarations の DecoratorInfo
    // から動的に引く。greeting.controller.ts: 8行目が class-level @UseMiddleware(LoggingMiddleware)、
    // 13行目が method-level @UseMiddleware(AuthMiddleware))
    const controllerId = nodeById(graph, 'src/greeting.controller.ts#GreetingController').id;
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        kind: 'applies-middleware',
        from: controllerId,
        to: nodeById(graph, 'src/logging.middleware.ts#LoggingMiddleware').id,
        line: 8,
      }),
    );
    expect(graph.edges).toContainEqual({
      kind: 'applies-middleware',
      from: controllerId,
      to: nodeById(graph, 'src/auth.middleware.ts#AuthMiddleware').id,
      methods: ['greet'],
      line: 13,
    });

    // injects エッジは既存どおり line を伴って存在する
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        kind: 'injects',
        from: nodeById(graph, 'src/greeting.controller.ts#GreetingController').id,
        to: nodeById(graph, 'src/greeting.service.ts#GreetingService').id,
      }),
    );

    const fnCount = graph.nodes.filter(isFnNode).length;
    expect(fnCount).toBeGreaterThan(0);

    // レビュー指摘10: @zeltjs/eventbus の emit/subscribe 相関(EventEdge + entry:{kind:'event'})が
    // 実際に発見されることを確認する(greeting.service.ts:GreetingService.greet が emit、
    // notification.handler.ts:NotificationHandler.subscribe が on の1組)
    const notificationSubscribe = nodeById(
      graph,
      'src/notification.handler.ts#NotificationHandler.subscribe',
    );
    expect(fieldsOf(notificationSubscribe).entry).toEqual({
      kind: 'event',
      event: 'greeting:sent',
    });
    const eventEdges = graph.edges.filter((e) => e.kind === 'event');
    expect(eventEdges).toHaveLength(1);
    expect(eventEdges).toContainEqual(
      expect.objectContaining({
        kind: 'event',
        from: greetServiceGreet.id,
        to: notificationSubscribe.id,
        event: 'greeting:sent',
      }),
    );
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
    const result = await runAnalyzer({
      cwd: resolve(__dirname, '../../test-fixtures/studio-app-broken'),
      analyzerPath: ANALYZER_SRC,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorOutput).toContain('no-such-module');
  }, 60_000);
});
