import { match } from 'ts-pattern';
import type ts from 'typescript';

import type {
  AnalysisReport,
  CoreResolver,
  Evidence,
  ExtractConfig,
  Feature,
  IgnoreRecommendation,
  Material,
  PluginContribution,
  PluginResult,
  ProviderId,
  ResolvedConfig,
  TestScopeConfig,
} from './core';
import { revisionOf } from './extraction-program.lib';
import type { LibraryInput } from './plugins';
import {
  analyzeDrizzle,
  analyzeHttpRequests,
  analyzeValibot,
  analyzeVitest,
  analyzeZelt,
  DRIZZLE_FEATURES,
  DRIZZLE_PROVIDER,
  HTTP_REQUESTS_FEATURES,
  HTTP_REQUESTS_PROVIDER,
  VALIBOT_FEATURES,
  VALIBOT_PROVIDER,
  VITEST_FEATURES,
  VITEST_PROVIDER,
  ZELT_FEATURES,
  ZELT_PROVIDER,
} from './plugins';

const coreReport = (
  inspectedFiles: readonly string[],
  scope: readonly string[],
): AnalysisReport => ({
  id: `report:${JSON.stringify(['ts', 'declarations', 'source'])}`,
  provider: 'ts',
  feature: 'declarations',
  status: 'complete-in-scope',
  scope: { files: scope, category: 'source' },
  inspectedFiles,
  diagnostics: [],
});

// 配信しない材料(test 系)は根拠を持たないので、provider の照合対象から外す
const evidenceOf = (material: Material): readonly Evidence[] =>
  material.kind === 'test' ||
  material.kind === 'test-setup' ||
  material.kind === 'application' ||
  material.kind === 'request'
    ? []
    : material.evidence;

const reportViolations = (
  id: string,
  features: readonly Feature[],
  reports: readonly AnalysisReport[],
): string[] => {
  const violations: string[] = [];
  for (const report of reports) {
    if (report.provider !== id) violations.push(`${id}: report claims provider ${report.provider}`);
    if (!features.includes(report.feature)) {
      violations.push(`${id}: report for an undeclared feature ${report.feature}`);
    }
  }
  for (const feature of features) {
    if (!reports.some((report) => report.feature === feature)) {
      violations.push(`${id}: no report for the declared feature ${feature}`);
    }
  }
  return violations;
};

/** 付録C: host が plugin.id・feature・revision の一致を確かめる。違反は生成失敗 */
export const pluginContractViolations = (
  id: string,
  features: readonly Feature[],
  revision: string,
  result: PluginResult,
): string[] => [
  ...(result.revision === revision ? [] : [`${id}: analysed a different revision`]),
  ...reportViolations(id, features, result.reports),
  ...result.materials
    .flatMap(evidenceOf)
    .filter((item) => item.provider !== id)
    .map((item) => `${id}: evidence claims provider ${item.provider}`),
];

export type PluginRunContext = {
  readonly program: ts.Program;
  readonly config: ResolvedConfig;
  readonly resolver: CoreResolver;
  readonly inspectedFiles: readonly string[];
  /** app を読み込む子プロセスの entry(付録D) */
  readonly zeltEntryPath: string;
};

type Accumulator = {
  readonly plugins: PluginContribution[];
  readonly ignoreRecommendations: IgnoreRecommendation[];
};

type Accepted = {
  readonly id: ProviderId;
  readonly features: readonly Feature[];
  readonly revision: string;
  readonly result: PluginResult;
  /** ignore 提案を出すのは、ホワイトリストを持つ plugin だけ(4.2) */
  readonly collectIgnores: boolean;
};

const accept = (acc: Accumulator, accepted: Accepted): string[] => {
  const violations = pluginContractViolations(
    accepted.id,
    accepted.features,
    accepted.revision,
    accepted.result,
  );
  if (violations.length > 0) return violations;
  acc.plugins.push({
    id: accepted.id,
    materials: accepted.result.materials,
    reports: accepted.result.reports,
  });
  if (accepted.collectIgnores) {
    acc.ignoreRecommendations.push(...accepted.result.ignoreRecommendations);
  }
  return [];
};

type PluginConfig = ExtractConfig['plugins'][number];

/** どの plugin も受け取る解析の入り口。plugin 固有の設定を持たない LibraryInput と同じ形 */
const analysisInput = (ctx: PluginRunContext, revision: string): LibraryInput => ({
  program: ctx.program,
  checker: ctx.program.getTypeChecker(),
  config: ctx.config,
  resolver: ctx.resolver,
  revision,
});

/** vitest plugin が無ければ範囲は空。Zelt は登録の形を知らず、範囲だけを受け取る(付録C) */
const testScopesOf = (ctx: PluginRunContext): readonly TestScopeConfig[] =>
  match(ctx.config.raw.plugins.find((plugin) => plugin.id === VITEST_PROVIDER))
    .with({ id: VITEST_PROVIDER }, (vitest) => vitest.scopes)
    .otherwise(() => []);

/** plugin ごとに違うのは入力の作り方だけ。variant が増えたら exhaustive が compile error にする */
const analyze = (
  ctx: PluginRunContext,
  input: LibraryInput,
  plugin: PluginConfig,
): PluginResult | Promise<PluginResult> =>
  match(plugin)
    .with({ id: ZELT_PROVIDER }, (zelt) =>
      analyzeZelt({
        ...input,
        applications: zelt.applications,
        entryPath: ctx.zeltEntryPath,
        timeoutMs: zelt.timeoutMs,
        testScopes: testScopesOf(ctx),
        setupDetails: zelt.setupDetails,
      }),
    )
    .with({ id: VALIBOT_PROVIDER }, () => analyzeValibot(input))
    .with({ id: DRIZZLE_PROVIDER }, () => analyzeDrizzle(input))
    .with({ id: VITEST_PROVIDER }, (vitest) =>
      analyzeVitest({ ...input, scopes: vitest.scopes, globals: vitest.globals }),
    )
    .with({ id: HTTP_REQUESTS_PROVIDER }, (requests) =>
      analyzeHttpRequests({
        ...input,
        scopes: requests.scopes,
        applications: requests.applications,
        helpers: requests.helpers,
      }),
    )
    .exhaustive();

type Runner = {
  readonly id: PluginConfig['id'];
  readonly features: readonly Feature[];
  /** ignore 提案を出すのは、ホワイトリストを持つ plugin だけ(4.2) */
  readonly collectIgnores: boolean;
};

/** 宣言順(zelt → library → vitest → requests)。材料の並びを決めるので入れ替えない */
const RUNNERS: readonly Runner[] = [
  { id: ZELT_PROVIDER, features: ZELT_FEATURES, collectIgnores: true },
  { id: VALIBOT_PROVIDER, features: VALIBOT_FEATURES, collectIgnores: true },
  { id: DRIZZLE_PROVIDER, features: DRIZZLE_FEATURES, collectIgnores: true },
  { id: VITEST_PROVIDER, features: VITEST_FEATURES, collectIgnores: false },
  { id: HTTP_REQUESTS_PROVIDER, features: HTTP_REQUESTS_FEATURES, collectIgnores: false },
];

export type PluginRunResult =
  | {
      ok: true;
      readonly plugins: readonly PluginContribution[];
      readonly ignoreRecommendations: readonly IgnoreRecommendation[];
    }
  | { ok: false; readonly violations: readonly string[] };

/** config が有効にした plugin を RUNNERS の順で走らせる */
export const runPlugins = async (ctx: PluginRunContext): Promise<PluginRunResult> => {
  const acc: Accumulator = {
    plugins: [
      {
        id: 'ts',
        materials: [],
        reports: [coreReport(ctx.inspectedFiles, ctx.config.raw.include)],
      },
    ],
    ignoreRecommendations: [],
  };
  const revision = revisionOf(ctx.program);
  const input = analysisInput(ctx, revision);
  for (const runner of RUNNERS) {
    const plugin = ctx.config.raw.plugins.find((entry) => entry.id === runner.id);
    if (plugin === undefined) continue;
    // zelt だけが子プロセスを待つ。await を順番に並べて材料の並びを保つ
    const violations = accept(acc, {
      id: runner.id,
      features: runner.features,
      revision,
      result: await analyze(ctx, input, plugin),
      collectIgnores: runner.collectIgnores,
    });
    if (violations.length > 0) return { ok: false, violations };
  }
  return { ok: true, plugins: acc.plugins, ignoreRecommendations: acc.ignoreRecommendations };
};
