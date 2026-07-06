import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GRAPH_MARKER } from './analyzer-protocol';
import { parseAnalyzerOutput, runAnalyzer } from './analyzer-runner.lib';
import type { DependencyGraph } from './graph/graph.types';

const graph: DependencyGraph = { version: 1, nodes: [], edges: [] };

describe('parseAnalyzerOutput', () => {
  it('parses graph from marker line', () => {
    const stdout = `user log line\n${GRAPH_MARKER}${JSON.stringify(graph)}\n`;
    expect(parseAnalyzerOutput(0, stdout, '')).toEqual({ ok: true, graph });
  });

  it('returns stderr as errorOutput on non-zero exit', () => {
    const result = parseAnalyzerOutput(1, '', 'Error: boom');
    expect(result).toEqual({ ok: false, errorOutput: 'Error: boom' });
  });

  it('fails when marker line is missing despite exit 0', () => {
    const result = parseAnalyzerOutput(0, 'no marker here', '');
    expect(result.ok).toBe(false);
  });

  it('fails on malformed JSON after marker', () => {
    const result = parseAnalyzerOutput(0, `${GRAPH_MARKER}{oops`, '');
    expect(result.ok).toBe(false);
  });
});

describe('runAnalyzer', () => {
  // 「エラーを握り潰さない」契約: プロセス起動が失敗しても errorOutput で伝搬する
  it('reports failure when analyzer path does not exist', async () => {
    const result = await runAnalyzer({
      cwd: process.cwd(),
      analyzerPath: '/no/such/analyzer-entry.ts',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorOutput.length).toBeGreaterThan(0);
  }, 30_000);

  // spawn に存在しない cwd を渡すと Linux では 'error' イベント（ENOENT）が起きる。
  // Fix 3 で resolveTsxCli/spawn 準備を try/catch した後もこの経路は壊さない。
  it('reports failure when cwd does not exist (spawn error event)', async () => {
    const result = await runAnalyzer({
      cwd: '/nonexistent-zelt-studio-test',
      analyzerPath: '/no/such/analyzer-entry.ts',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorOutput.length).toBeGreaterThan(0);
  }, 30_000);

  it('kills the analyzer and reports a timeout when it hangs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zelt-studio-analyzer-timeout-'));
    const hangingAnalyzerPath = join(dir, 'hanging-analyzer.ts');
    await writeFile(hangingAnalyzerPath, 'await new Promise((r) => setTimeout(r, 60_000));\n');

    const result = await runAnalyzer({
      cwd: process.cwd(),
      analyzerPath: hangingAnalyzerPath,
      timeoutMs: 500,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorOutput).toContain('timed out');
  }, 30_000);
});
