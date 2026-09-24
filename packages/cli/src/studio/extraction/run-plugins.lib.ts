import type ts from 'typescript';

import type {
  AnalysisReport,
  CoreResolver,
  Evidence,
  Feature,
  IgnoreRecommendation,
  Material,
  PluginContribution,
  PluginResult,
  ProviderId,
  ResolvedConfig,
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

const runZelt = (ctx: PluginRunContext, acc: Accumulator): string[] => {
  const zelt = ctx.config.raw.plugins.find((plugin) => plugin.id === 'zelt');
  if (zelt === undefined) return [];
  const revision = revisionOf(ctx.program);
  const result = analyzeZelt({
    program: ctx.program,
    checker: ctx.program.getTypeChecker(),
    config: ctx.config,
    resolver: ctx.resolver,
    applications: zelt.applications,
    testScopes: ctx.config.raw.plugins.find((plugin) => plugin.id === 'vitest')?.scopes ?? [],
    setupDetails: zelt.setupDetails,
    revision,
  });
  return accept(acc, {
    id: ZELT_PROVIDER,
    features: ZELT_FEATURES,
    revision,
    result,
    collectIgnores: true,
  });
};

const LIBRARIES = [
  { id: VALIBOT_PROVIDER, features: VALIBOT_FEATURES, analyze: analyzeValibot },
  { id: DRIZZLE_PROVIDER, features: DRIZZLE_FEATURES, analyze: analyzeDrizzle },
] as const;

const runLibraries = (ctx: PluginRunContext, acc: Accumulator): string[] => {
  for (const library of LIBRARIES) {
    if (!ctx.config.raw.plugins.some((plugin) => plugin.id === library.id)) continue;
    const revision = revisionOf(ctx.program);
    const input: LibraryInput = {
      program: ctx.program,
      checker: ctx.program.getTypeChecker(),
      config: ctx.config,
      resolver: ctx.resolver,
      revision,
    };
    const violations = accept(acc, {
      id: library.id,
      features: library.features,
      revision,
      result: library.analyze(input),
      collectIgnores: true,
    });
    if (violations.length > 0) return violations;
  }
  return [];
};

const runVitest = (ctx: PluginRunContext, acc: Accumulator): string[] => {
  const vitest = ctx.config.raw.plugins.find((plugin) => plugin.id === 'vitest');
  if (vitest === undefined) return [];
  const revision = revisionOf(ctx.program);
  const result = analyzeVitest({
    program: ctx.program,
    checker: ctx.program.getTypeChecker(),
    config: ctx.config,
    resolver: ctx.resolver,
    scopes: vitest.scopes,
    globals: vitest.globals,
    revision,
  });
  return accept(acc, {
    id: VITEST_PROVIDER,
    features: VITEST_FEATURES,
    revision,
    result,
    collectIgnores: false,
  });
};

const runHttpRequests = (ctx: PluginRunContext, acc: Accumulator): string[] => {
  const requests = ctx.config.raw.plugins.find((plugin) => plugin.id === 'http-requests');
  if (requests === undefined) return [];
  const revision = revisionOf(ctx.program);
  const result = analyzeHttpRequests({
    program: ctx.program,
    checker: ctx.program.getTypeChecker(),
    config: ctx.config,
    resolver: ctx.resolver,
    scopes: requests.scopes,
    applications: requests.applications,
    helpers: requests.helpers,
    revision,
  });
  return accept(acc, {
    id: HTTP_REQUESTS_PROVIDER,
    features: HTTP_REQUESTS_FEATURES,
    revision,
    result,
    collectIgnores: false,
  });
};

export type PluginRunResult =
  | {
      ok: true;
      readonly plugins: readonly PluginContribution[];
      readonly ignoreRecommendations: readonly IgnoreRecommendation[];
    }
  | { ok: false; readonly violations: readonly string[] };

/** config が有効にした plugin を宣言順(zelt → library → vitest → requests)で走らせる */
export const runPlugins = (ctx: PluginRunContext): PluginRunResult => {
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
  for (const run of [runZelt, runLibraries, runVitest, runHttpRequests]) {
    const violations = run(ctx, acc);
    if (violations.length > 0) return { ok: false, violations };
  }
  return { ok: true, plugins: acc.plugins, ignoreRecommendations: acc.ignoreRecommendations };
};
