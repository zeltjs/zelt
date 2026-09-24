import { randomUUID } from 'node:crypto';
import { open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import ts from 'typescript';
import { safeParse } from 'valibot';

import type {
  AnalysisReport,
  IgnoreRecommendation,
  PluginContribution,
  ResolvedConfig,
  SourceFacts,
  StudioSnapshot,
} from './core';
import { assemble, buildCoreFacts, resolveExtractConfig, StudioSnapshotSchema } from './core';
import {
  createExtractionProgram,
  listIncludedFiles,
  listTestScopeFiles,
  spanReader,
} from './extraction-program.lib';
import { defaultInspectEntry } from './plugins';
import { runPlugins } from './run-plugins.lib';

export type ExtractOptions = {
  /** overrides config.output; keeps the hand-written fixture safe while staging */
  readonly output?: string;
  /** stage-by-stage escape hatch: publish even if `required` features have no plugin yet */
  readonly allowIncomplete?: boolean;
  /** app を読み込む子プロセスの entry。build 後は dist の .js を渡す(付録D) */
  readonly zeltEntryPath?: string;
};

export type ExtractionResult =
  | {
      kind: 'published';
      readonly snapshotId: string;
      readonly output: string;
      readonly reports: readonly AnalysisReport[];
      /** plugin が出した「意識しなくてよい export」。採否は人が config に書く(4.2) */
      readonly ignoreRecommendations: readonly IgnoreRecommendation[];
    }
  | {
      kind: 'failed';
      readonly phase: 'config' | 'index' | 'plugin' | 'assembly' | 'publish';
      readonly diagnostics: readonly string[];
    };

type Failure = Extract<ExtractionResult, { kind: 'failed' }>;

/** 各段の結果。失敗はそのまま extract の戻り値になる */
type Stage<T> = { ok: true; readonly value: T } | { ok: false; readonly failure: Failure };

const failed = (phase: Failure['phase'], diagnostics: readonly string[]): Stage<never> => ({
  ok: false,
  failure: { kind: 'failed', phase, diagnostics },
});

const readConfig = async (configFile: string): Promise<Stage<ResolvedConfig>> => {
  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(await readFile(configFile, 'utf8'));
  } catch (error) {
    return failed('config', [`cannot read ${configFile}: ${String(error)}`]);
  }
  const resolved = resolveExtractConfig(rawConfig, configFile);
  if (!resolved.ok) {
    return failed(
      'config',
      resolved.issues.map((i) => `${i.path}: ${i.message}`),
    );
  }
  return { ok: true, value: resolved.config };
};

const buildProgram = (config: ResolvedConfig): Stage<ts.Program> => {
  const included = listIncludedFiles(config);
  if (included.length === 0) return failed('index', ['include matched no file']);
  const rootNames = [...new Set([...included, ...listTestScopeFiles(config)])].sort();
  const program = createExtractionProgram(config, rootNames);
  const syntactic = program.getSyntacticDiagnostics();
  if (syntactic.length > 0) {
    return failed(
      'index',
      syntactic.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')),
    );
  }
  return { ok: true, value: program };
};

const buildSnapshot = (input: {
  readonly config: ResolvedConfig;
  readonly program: ts.Program;
  readonly facts: SourceFacts;
  readonly plugins: readonly PluginContribution[];
  readonly allowIncomplete: boolean;
}): Stage<StudioSnapshot> => {
  const assembled = assemble({
    config: input.config,
    facts: input.facts,
    plugins: input.plugins,
    readSpan: spanReader(input.program, input.config.root),
    enforceRequired: !input.allowIncomplete,
  });
  if (!assembled.ok) {
    return failed(
      'assembly',
      assembled.failures.map((f) => `${f.code}: ${f.message}`),
    );
  }
  const validated = safeParse(StudioSnapshotSchema, assembled.snapshot);
  if (!validated.success) {
    return failed(
      'assembly',
      validated.issues.map(
        (i) => `${(i.path ?? []).map((p) => String(p.key)).join('.')}: ${i.message}`,
      ),
    );
  }
  return { ok: true, value: assembled.snapshot };
};

/** @throws {Error} when the output cannot be written or another run holds the lock */
const publish = async (output: string, json: string): Promise<void> => {
  const lock = `${output}.lock`;
  const handle = await open(lock, 'wx');
  try {
    const temporary = `${output}.${randomUUID()}.tmp`;
    await writeFile(temporary, json);
    // 書いたファイルそのものを読み直して schema を再検証してから atomic rename する(付録J)
    const verified = safeParse(StudioSnapshotSchema, JSON.parse(await readFile(temporary, 'utf8')));
    if (!verified.success) {
      await rm(temporary, { force: true });
      throw new Error('the written snapshot does not satisfy the v1 schema');
    }
    await rename(temporary, output);
  } finally {
    await handle.close();
    await rm(lock, { force: true });
  }
};

const outputPathOf = (config: ResolvedConfig, options: ExtractOptions): string =>
  options.output === undefined ? config.output : resolve(options.output);

const publishSnapshot = async (
  output: string,
  snapshot: StudioSnapshot,
): Promise<Failure | null> => {
  try {
    await publish(output, `${JSON.stringify(snapshot, null, 2)}\n`);
    return null;
  } catch (error) {
    return { kind: 'failed', phase: 'publish', diagnostics: [String(error)] };
  }
};

type Collected = {
  readonly facts: SourceFacts;
  readonly plugins: readonly PluginContribution[];
  readonly ignoreRecommendations: readonly IgnoreRecommendation[];
};

/** 索引を作り、config が有効にした plugin の材料を集めるまで */
const collect = async (
  config: ResolvedConfig,
  program: ts.Program,
  options: ExtractOptions,
): Promise<Stage<Collected>> => {
  const indexed = buildCoreFacts(program, config);
  const run = await runPlugins({
    program,
    config,
    resolver: indexed.resolver,
    inspectedFiles: indexed.inspectedFiles,
    zeltEntryPath: options.zeltEntryPath ?? defaultInspectEntry(),
  });
  if (!run.ok) return failed('plugin', run.violations);
  return {
    ok: true,
    // plugin が解決した接点のぶんだけ箱が増えるので、材料を集めたあとに事実を取り直す(4.2)
    value: {
      facts: indexed.resolver.facts(),
      plugins: run.plugins,
      ignoreRecommendations: run.ignoreRecommendations,
    },
  };
};

export const extract = async (
  configFile: string,
  options: ExtractOptions = {},
): Promise<ExtractionResult> => {
  const configStage = await readConfig(configFile);
  if (!configStage.ok) return configStage.failure;
  const config = configStage.value;

  const programStage = buildProgram(config);
  if (!programStage.ok) return programStage.failure;
  const program = programStage.value;

  const collected = await collect(config, program, options);
  if (!collected.ok) return collected.failure;
  const run = collected.value;

  const snapshotStage = buildSnapshot({
    config,
    program,
    facts: run.facts,
    plugins: run.plugins,
    allowIncomplete: options.allowIncomplete === true,
  });
  if (!snapshotStage.ok) return snapshotStage.failure;

  const output = outputPathOf(config, options);
  const writeFailure = await publishSnapshot(output, snapshotStage.value);
  if (writeFailure !== null) return writeFailure;
  return {
    kind: 'published',
    snapshotId: snapshotStage.value.snapshotId,
    output,
    reports: run.plugins.flatMap((plugin) => plugin.reports),
    ignoreRecommendations: run.ignoreRecommendations,
  };
};
