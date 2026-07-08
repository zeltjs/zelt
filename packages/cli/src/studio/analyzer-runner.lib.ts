import type { ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import type { Readable } from 'node:stream';

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
  readonly timeoutMs?: number | undefined;
};

// 大規模プロジェクトの TS Program 構築を考慮した上限。これを超えて子プロセスが
// 応答しない場合はユーザーの config.app() がハングしているとみなして打ち切る
export const ANALYZER_TIMEOUT_MS = 120_000;

// dev-server.lib.ts の KILL_TIMEOUT_MS と同じ猶予。SIGTERM がツリーに行き渡らない
// 場合に SIGKILL へ切り替えるまでの時間
const KILL_GRACE_MS = 3000;

const require_ = createRequire(import.meta.url);

// tsx を PATH ではなく自パッケージの runtime dependency から解決する
// （公開 CLI をグローバル install したユーザー環境でも確実に動かすため）
const resolveTsxCli = (): string => require_.resolve('tsx/cli');

const analyzerArgs = (options: RunAnalyzerOptions): readonly string[] =>
  options.configFile !== undefined
    ? [options.analyzerPath, options.configFile]
    : [options.analyzerPath];

// tsx CLI は実行用の node 孫プロセスを spawn し、SIGTERM をそちらへ転送する。
// SIGKILL は転送不能で wrapper だけが死に、孫が pipe を掴んだまま残って close が
// 永遠に発火しなくなるため、SIGTERM 起点で止め、猶予後に SIGKILL + pipe destroy する
const scheduleTimeoutKill = (
  child: ChildProcessByStdio<null, Readable, Readable>,
  timeoutMs: number,
  onTimeout: () => void,
): { readonly clear: () => void } => {
  let forceKillTimer: NodeJS.Timeout | undefined;
  const timer = setTimeout(() => {
    onTimeout();
    child.kill('SIGTERM');
    forceKillTimer = setTimeout(() => {
      child.kill('SIGKILL');
      // 孫が生き残っても自分側の pipe を閉じて close を必ず発火させる
      child.stdout.destroy();
      child.stderr.destroy();
    }, KILL_GRACE_MS);
  }, timeoutMs);
  return {
    clear: () => {
      clearTimeout(timer);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
    },
  };
};

export const runAnalyzer = (options: RunAnalyzerOptions): Promise<AnalyzeResult> =>
  new Promise((resolvePromise) => {
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(process.execPath, [resolveTsxCli(), ...analyzerArgs(options)], {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolvePromise({ ok: false, errorOutput: String(error) });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? ANALYZER_TIMEOUT_MS;
    const killer = scheduleTimeoutKill(child, timeoutMs, () => {
      timedOut = true;
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      killer.clear();
      if (timedOut) {
        const suffix = stderr.trim() !== '' ? `\n${stderr}` : '';
        resolvePromise({
          ok: false,
          errorOutput: `Analyzer timed out after ${timeoutMs}ms${suffix}`,
        });
        return;
      }
      resolvePromise(parseAnalyzerOutput(code, stdout, stderr));
    });
    child.on('error', (error) => {
      killer.clear();
      resolvePromise({ ok: false, errorOutput: String(error) });
    });
  });
