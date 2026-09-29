import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AnalysisReport,
  ExtractionResult,
  ExtractOptions,
  SnapshotJsonResult,
  SnapshotOptions,
} from '@zeltjs/studio-extract';
import { extract, extractSnapshotJson } from '@zeltjs/studio-extract';
import { defineCommand } from 'citty';
import consola from 'consola';

import type { CliRuntime } from './cli-runtime.lib';
import { nodeCliRuntime } from './cli-runtime.lib';
import type { StartStudioServerOptions, StudioServer } from './studio-serve.lib';
import { startStudioServer } from './studio-serve.lib';

const DEFAULT_PORT = 4400;

// bundle 後は dist/cli.js の隣、source から動かすときは workspace のそれぞれの成果物。
// 先に見つかった方を使うので、どちらの起動でも同じ子プロセス/同じ UI が使われる
const INSPECT_ENTRY_LOCATIONS = [
  './studio-extract/zelt-inspect-entry.js',
  '../../studio-extract/src/plugins/zelt-inspect-entry.ts',
];
const STUDIO_UI_LOCATIONS = ['./studio-ui', '../../studio-ui/dist'];

const firstExisting = (locations: readonly string[]): string | undefined => {
  for (const location of locations) {
    const path = fileURLToPath(new URL(location, import.meta.url));
    if (existsSync(path)) return path;
  }
  return undefined;
};

const inspectEntryPath = firstExisting(INSPECT_ENTRY_LOCATIONS);
const studioUiDir = firstExisting(STUDIO_UI_LOCATIONS);

// zelt.config.ts を渡す旧 studio は廃止済み。無言で「config が読めない」に落とさず、
// 移行先を名指しで伝える
const LEGACY_CONFIG_EXTENSIONS: readonly string[] = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];
const LEGACY_CONFIG_MESSAGE =
  'zelt studio takes an extract config JSON (--config <name>.extract.json). The zelt.config.ts based studio was removed.';

// citty は知らない引数を黙って捨てるので、廃止した --export はここで名指しで断る
// (放っておくと「書き出すつもりが配信が始まる」ことになる)
const REMOVED_EXPORT_MESSAGE =
  '--export was removed. Use `zelt studio extract --config <name>.extract.json [--output <path>]`.';

const hasRemovedExportFlag = (rawArgs: readonly string[]): boolean =>
  rawArgs.some((arg) => arg === '--export' || arg.startsWith('--export='));

// citty の ArgsDef は optional な string 引数も `string` 型に見せるため、
// 実際の optionality (未指定時は undefined) を持つ型で受け直す
type StudioArgs = {
  readonly config?: string;
  readonly port?: string;
  readonly open?: boolean;
  readonly output?: string;
  readonly 'allow-incomplete'?: boolean;
};

type StudioRuntime = Pick<CliRuntime, 'setExitCode'>;
type OpenBrowser = (url: string) => void;
type StartServer = (options: StartStudioServerOptions) => Promise<StudioServer>;
type SnapshotExtract = (
  configFile: string,
  options: SnapshotOptions,
) => Promise<SnapshotJsonResult>;
type FileExtract = (configFile: string, options: ExtractOptions) => Promise<ExtractionResult>;

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

export type StudioPlan =
  | {
      kind: 'serve';
      readonly configFile: string;
      readonly port: number;
      readonly open: boolean;
      readonly allowIncomplete: boolean;
    }
  | {
      kind: 'extract';
      readonly configFile: string;
      readonly output: string | undefined;
      readonly allowIncomplete: boolean;
    }
  | { kind: 'invalid'; readonly message: string };

const missingConfigMessage = (extractOnly: boolean): string =>
  `zelt studio${extractOnly ? ' extract' : ''} requires --config <name>.extract.json`;

const planServe = (args: StudioArgs, configFile: string, allowIncomplete: boolean): StudioPlan => {
  const port = resolvePort(args.port);
  if (port === undefined) return { kind: 'invalid', message: `Invalid port: ${args.port ?? ''}` };
  return { kind: 'serve', configFile, port, open: args.open ?? false, allowIncomplete };
};

/** 引数の解釈だけを行う。IO を伴う判定 (config の実在など) は実行側に残す */
export const planStudio = (rawArgs: readonly string[], args: StudioArgs): StudioPlan => {
  // citty の subCommands は親の run も続けて呼ぶため、ここで分岐する
  // (既存の `zelt studio --config <file>` を壊さないため subCommands は使わない)
  if (hasRemovedExportFlag(rawArgs)) return { kind: 'invalid', message: REMOVED_EXPORT_MESSAGE };
  const extractOnly = rawArgs[0] === 'extract';
  const configFile = nonEmpty(args.config);
  if (configFile === undefined) {
    return { kind: 'invalid', message: missingConfigMessage(extractOnly) };
  }
  if (LEGACY_CONFIG_EXTENSIONS.includes(extname(configFile))) {
    return { kind: 'invalid', message: LEGACY_CONFIG_MESSAGE };
  }
  const allowIncomplete = args['allow-incomplete'] ?? false;
  if (extractOnly) {
    return { kind: 'extract', configFile, output: nonEmpty(args.output), allowIncomplete };
  }
  return planServe(args, configFile, allowIncomplete);
};

const snapshotOptions = (allowIncomplete: boolean): SnapshotOptions => ({
  allowIncomplete,
  ...(inspectEntryPath === undefined ? {} : { zeltEntryPath: inspectEntryPath }),
});

const logReports = (reports: readonly AnalysisReport[]): void => {
  for (const report of reports) {
    consola.info(`${report.provider}/${report.feature}: ${report.status}`);
    for (const diagnostic of report.diagnostics) {
      consola.warn(
        `${report.provider}/${report.feature}: ${diagnostic.code} ${diagnostic.message}`,
      );
    }
  }
};

const logFailure = (failure: Extract<ExtractionResult, { kind: 'failed' }>): void => {
  consola.error(`studio extract failed during ${failure.phase}`);
  for (const diagnostic of failure.diagnostics) consola.error(diagnostic);
};

export type ExtractPorts = { readonly extract?: FileExtract };

export const runExtract = async (
  cwd: string,
  plan: Extract<StudioPlan, { kind: 'extract' }>,
  runtime: StudioRuntime,
  ports: ExtractPorts = {},
): Promise<void> => {
  const outputArg = plan.output;
  const result = await (ports.extract ?? extract)(resolve(cwd, plan.configFile), {
    ...snapshotOptions(plan.allowIncomplete),
    ...(outputArg === undefined ? {} : { output: resolve(cwd, outputArg) }),
  });
  if (result.kind === 'failed') {
    logFailure(result);
    runtime.setExitCode(1);
    return;
  }
  logReports(result.reports);
  // 採否は人が config に書く。抽出器は勝手に適用しない (4.2)
  for (const recommendation of result.ignoreRecommendations) {
    consola.info(
      `ignore suggestion ${recommendation.package}: ${recommendation.exports.join(', ')}`,
    );
  }
  consola.success(`Snapshot ${result.snapshotId.slice(0, 12)} written to ${result.output}`);
};

export type ServePorts = {
  readonly extractSnapshotJson?: SnapshotExtract;
  readonly startServer?: StartServer;
  readonly openBrowser?: OpenBrowser;
  /** UI の同梱先。壊れたインストールでは見つからないため undefined を返しうる */
  readonly locateStudioUi?: () => string | undefined;
};

const ownStudioUi = (): string | undefined => studioUiDir;

/** @throws {Error} from studio-serve.lib.ts:startStudioServer (non-EADDRINUSE bind failures) */
const listenAndAnnounce = async (
  options: StartStudioServerOptions,
  open: boolean,
  runtime: StudioRuntime,
  ports: ServePorts,
): Promise<StudioServer | undefined> => {
  try {
    const server = await (ports.startServer ?? startStudioServer)(options);
    consola.success(`zelt studio running at ${server.url}`);
    if (open) (ports.openBrowser ?? openBrowser)(server.url);
    return server;
  } catch (error) {
    if (isEaddrinuse(error)) {
      consola.error(`Port ${options.port} is already in use. Try --port <other>`);
      runtime.setExitCode(1);
      return undefined;
    }
    throw error;
  }
};

/** @throws {Error} from studio.command.ts:listenAndAnnounce */
export const runServe = async (
  cwd: string,
  plan: Extract<StudioPlan, { kind: 'serve' }>,
  runtime: StudioRuntime,
  ports: ServePorts = {},
): Promise<StudioServer | undefined> => {
  const staticDir = (ports.locateStudioUi ?? ownStudioUi)();
  if (staticDir === undefined) {
    consola.error('The studio UI assets are missing from this @zeltjs/cli installation.');
    runtime.setExitCode(1);
    return undefined;
  }
  const result = await (ports.extractSnapshotJson ?? extractSnapshotJson)(
    resolve(cwd, plan.configFile),
    snapshotOptions(plan.allowIncomplete),
  );
  // 抽出に失敗したら配信しない。古い/欠けた構造を画面に出すと、無いものが無いと読めない
  if (result.kind === 'failed') {
    logFailure(result);
    runtime.setExitCode(1);
    return undefined;
  }
  logReports(result.reports);
  return listenAndAnnounce(
    { port: plan.port, staticDir, snapshotJson: result.json },
    plan.open,
    runtime,
    ports,
  );
};

export const studioCommand = defineCommand({
  meta: {
    name: 'studio',
    description: 'Extract the application structure and browse it on localhost',
  },
  args: {
    config: {
      type: 'string',
      alias: 'c',
      description: 'Path to the extract config JSON (<name>.extract.json)',
    },
    port: { type: 'string', description: `Port to listen on (default ${DEFAULT_PORT})` },
    open: { type: 'boolean', description: 'Open the browser after start' },
    output: {
      type: 'string',
      description: 'extract only: override the output path from the extract config',
    },
    'allow-incomplete': {
      type: 'boolean',
      // 段階実装の間だけ、未実装 plugin の required で止めずに配信するための逃げ道
      description: 'publish even if a required provider/feature has no plugin yet',
    },
  },
  /** @throws {Error} from studio.command.ts:runServe */
  async run({ args, rawArgs }) {
    const typedArgs: StudioArgs = args;
    const cwd = nodeCliRuntime.cwd();
    const plan = planStudio(rawArgs, typedArgs);
    if (plan.kind === 'invalid') {
      consola.error(plan.message);
      nodeCliRuntime.setExitCode(1);
      return;
    }
    if (plan.kind === 'extract') {
      await runExtract(cwd, plan, nodeCliRuntime);
      return;
    }
    await runServe(cwd, plan, nodeCliRuntime);
  },
});
