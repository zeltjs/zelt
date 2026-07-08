import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineCommand } from 'citty';
import consola from 'consola';

import type { CliRuntime } from './cli-runtime.lib';
import { nodeCliRuntime } from './cli-runtime.lib';
import { runAnalyzer, startStudioServer } from './studio/index';

const DEFAULT_PORT = 4400;

// ビルド後は dist/cli.js から見た dist/studio/analyzer-entry.js
const analyzerPath = fileURLToPath(new URL('./studio/analyzer-entry.js', import.meta.url));
const staticDir = fileURLToPath(new URL('./studio-ui', import.meta.url));

// citty の ArgsDef は optional な string 引数も `string` 型に見せるため、
// 実際の optionality (未指定時は undefined) を持つ型で受け直す
type StudioArgs = {
  readonly config?: string;
  readonly port?: string;
  readonly open?: boolean;
  readonly export?: string;
};

type Analyze = () => ReturnType<typeof runAnalyzer>;

// テストでは setExitCode/writeStdout だけを vi.fn() で差し替える（dev-server.lib.ts の
// Pick<CliRuntime, 'onSignal' | 'offSignal'> と同じ、必要な範囲だけを DI する方針）
type StudioRuntime = Pick<CliRuntime, 'setExitCode' | 'writeStdout'>;
type StartServer = typeof startStudioServer;
type OpenBrowser = (url: string) => void;

const openBrowser: OpenBrowser = (url) => {
  // Windows の start は cmd の built-in なので直接 spawn できない
  if (nodeCliRuntime.platform() === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  const command = nodeCliRuntime.platform() === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [url], { stdio: 'ignore', detached: true }).unref();
};

// error は unknown からの instanceof 絞り込みのみで、Error 自体は code を持たないため
// 構造的型で受ける（isAppLike と同じ手法。in 演算子・as 断言を避ける）
const errorCode = (error: Error): unknown => {
  // message は Error 由来のプロパティと重ねて weak type 判定を避ける
  const record: { message: string; code?: unknown } = error;
  return record.code;
};

const isEaddrinuse = (error: unknown): boolean =>
  error instanceof Error && errorCode(error) === 'EADDRINUSE';

// citty は未指定の string 引数も "" にする（StudioArgs で undefined も見せる型にしている）ため
// 両方とも「未指定」として一箇所で正規化する
const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

export const resolvePort = (portArg: string | undefined): number | undefined => {
  const raw = nonEmpty(portArg);
  if (raw === undefined) return DEFAULT_PORT;
  const port = Number(raw);
  // server.listen は範囲外ポートで同期 RangeError を投げるため、ここで弾いて
  // 既存の Invalid port エラーパスに乗せる
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : undefined;
};

const exportGraph = async (
  cwd: string,
  analyze: Analyze,
  exportPath: string,
  runtime: StudioRuntime,
): Promise<void> => {
  const result = await analyze();
  if (!result.ok) {
    consola.error(result.errorOutput);
    runtime.setExitCode(1);
    return;
  }
  const json = JSON.stringify(result.graph, null, 2);
  if (exportPath === '-') {
    runtime.writeStdout(`${json}\n`);
    return;
  }
  await writeFile(resolve(cwd, exportPath), `${json}\n`);
  consola.success(`Graph written to ${exportPath}`);
};

// citty は `--export -` のように値が "-" 単体だとフラグへの値なしと解釈し、
// args.export を "" にする（未指定の undefined とは区別できる）。
// これを nonEmpty() で undefined と同一視すると、export のつもりが無言で
// サーバ起動にフォールバックしてしまうため、"" は専用のエラーとして扱う。
// 戻り値 true は「run() はこれ以上進めず return してよい」ことを示す。
export const handleExport = async (
  cwd: string,
  analyze: Analyze,
  exportArg: string | undefined,
  runtime: StudioRuntime,
): Promise<boolean> => {
  if (exportArg === '') {
    consola.error('--export requires a value. Use --export=<path> or --export=- for stdout.');
    runtime.setExitCode(1);
    return true;
  }
  if (exportArg === undefined) return false;
  await exportGraph(cwd, analyze, exportArg, runtime);
  return true;
};

/** @throws {Error} from server.lib.ts:startStudioServer (non-EADDRINUSE bind failures) */
export const serveStudio = async (
  analyze: Analyze,
  port: number,
  open: boolean,
  runtime: Pick<CliRuntime, 'setExitCode'>,
  startServer: StartServer = startStudioServer,
  doOpenBrowser: OpenBrowser = openBrowser,
): Promise<void> => {
  try {
    const server = await startServer({ port, staticDir, analyze });
    consola.success(`zelt studio running at ${server.url}`);
    if (open) doOpenBrowser(server.url);
  } catch (error) {
    if (isEaddrinuse(error)) {
      consola.error(`Port ${port} is already in use. Try --port <other>`);
      runtime.setExitCode(1);
      return;
    }
    throw error;
  }
};

export const studioCommand = defineCommand({
  meta: {
    name: 'studio',
    description: 'Visualize the module dependency graph',
  },
  args: {
    config: { type: 'string', alias: 'c', description: 'Path to zelt.config.ts' },
    port: { type: 'string', description: `Port to listen on (default ${DEFAULT_PORT})` },
    open: { type: 'boolean', description: 'Open the browser after start' },
    export: {
      type: 'string',
      // citty の引数パーサーは `--export -` のように値が "-" 単体だと
      // フラグに値なしと解釈するため、stdout 出力には `=` 構文が必須
      description: 'Write graph JSON to a file (use --export=- for stdout) and exit',
    },
  },
  async run({ args }) {
    const typedArgs: StudioArgs = args;
    const cwd = nodeCliRuntime.cwd();
    const analyze: Analyze = () =>
      runAnalyzer({ cwd, analyzerPath, configFile: nonEmpty(typedArgs.config) });

    if (await handleExport(cwd, analyze, typedArgs.export, nodeCliRuntime)) return;

    const port = resolvePort(typedArgs.port);
    if (port === undefined) {
      consola.error(`Invalid port: ${typedArgs.port}`);
      nodeCliRuntime.setExitCode(1);
      return;
    }

    await serveStudio(analyze, port, typedArgs.open ?? false, nodeCliRuntime);
  },
});
