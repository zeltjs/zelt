import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import { GRAPH_MARKER } from './analyzer-protocol';
import type { DependencyGraph } from './graph/index';

export type AnalyzeResult =
  | { ok: true; readonly graph: DependencyGraph }
  | { ok: false; readonly errorOutput: string };

const parseGraphJson = (markerLine: string): AnalyzeResult => {
  try {
    const graph = JSON.parse(markerLine.slice(GRAPH_MARKER.length)) as DependencyGraph;
    if (graph.version !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      return { ok: false, errorOutput: 'Analyzer produced graph JSON with unexpected shape' };
    }
    return { ok: true, graph };
  } catch {
    return { ok: false, errorOutput: 'Analyzer produced malformed graph JSON' };
  }
};

export const parseAnalyzerOutput = (
  exitCode: number | null,
  stdout: string,
  stderr: string,
): AnalyzeResult => {
  if (exitCode !== 0) {
    return { ok: false, errorOutput: stderr.trim() !== '' ? stderr : stdout };
  }
  // ユーザーコードが偶然 marker 文字列を出力した場合に備え、最後の marker 行を採用する
  const markerLine = stdout
    .split('\n')
    .filter((line) => line.startsWith(GRAPH_MARKER))
    .at(-1);
  if (markerLine === undefined) {
    return {
      ok: false,
      errorOutput: `Analyzer exited successfully but produced no graph output.\n${stderr}`,
    };
  }
  return parseGraphJson(markerLine);
};

export type RunAnalyzerOptions = {
  readonly cwd: string;
  readonly analyzerPath: string;
  readonly configFile?: string | undefined;
};

const require_ = createRequire(import.meta.url);

// tsx を PATH ではなく自パッケージの runtime dependency から解決する
// （公開 CLI をグローバル install したユーザー環境でも確実に動かすため）
const resolveTsxCli = (): string => require_.resolve('tsx/cli');

const analyzerArgs = (options: RunAnalyzerOptions): readonly string[] =>
  options.configFile !== undefined
    ? [options.analyzerPath, options.configFile]
    : [options.analyzerPath];

export const runAnalyzer = (options: RunAnalyzerOptions): Promise<AnalyzeResult> =>
  new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [resolveTsxCli(), ...analyzerArgs(options)], {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolvePromise(parseAnalyzerOutput(code, stdout, stderr));
    });
    child.on('error', (error) => {
      resolvePromise({ ok: false, errorOutput: String(error) });
    });
  });
