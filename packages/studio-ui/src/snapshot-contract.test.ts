import { resolve } from 'node:path';

import { extractSnapshot } from '@zeltjs/studio-extract';
import { describe, expect, it } from 'vitest';

import { readGraph } from './graph.lib';

const STUDIO_EXTRACT = resolve(import.meta.dirname, '../../studio-extract');
const FIXTURE = resolve(STUDIO_EXTRACT, 'test-fixtures/studio-app');

// 抽出器が返した snapshot をこの UI がそのまま読めることを、schema だけでなく
// readGraph の参照整合チェックまで通して確かめる (両者の契約は snapshot 一つだけ)
describe('extracted snapshot', () => {
  it('satisfies everything readGraph requires', async () => {
    const result = await extractSnapshot(resolve(FIXTURE, 'studio-app.extract.json'), {
      // app を読み込む子プロセスの entry は呼び出し側が渡す契約 (cli は bundle 後の .js を渡す)
      zeltEntryPath: resolve(STUDIO_EXTRACT, 'src/plugins/zelt-inspect-entry.ts'),
    });
    expect(result.kind === 'failed' ? result.diagnostics : []).toEqual([]);
    if (result.kind !== 'extracted') return;

    const graph = readGraph(result.snapshot);
    expect([...graph.groups.values()].map((group) => group.name)).toContain('GreetingController');
    expect(graph.snapshot.project.id).toBe('studio-app');
  }, 120_000);
});
