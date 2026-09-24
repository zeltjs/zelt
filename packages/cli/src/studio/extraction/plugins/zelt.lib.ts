import type ts from 'typescript';

import type { AnalysisReport, Feature, Material, PluginResult } from '../core';
import { resolveScopes } from '../core';
import type { ChainEntry, ZeltContext, ZeltInput } from './zelt.types';
import { applicationFacts, globalMiddlewaresOf } from './zelt-application.lib';
import { classFacts, routeFacts } from './zelt-class.lib';
import {
  createZeltContext,
  evidenceOf,
  execIdOf,
  note,
  ZELT_FEATURES,
  ZELT_PROVIDER,
} from './zelt-context.lib';
import { busCallsOf, eventTypeMeanings, subscriptionFacts } from './zelt-eventbus.lib';
import { ZELT_IGNORE_RECOMMENDATIONS } from './zelt-runtime.lib';
import type { TestSetupOutput } from './zelt-test-setup.lib';
import { analyzeZeltTestSetups } from './zelt-test-setup.lib';

export type { ZeltApplicationConfig, ZeltInput } from './zelt.types';
export { ZELT_FEATURES, ZELT_PROVIDER } from './zelt-context.lib';

/** source を見る feature。test-setups だけは config の Unit scope を範囲にする */
const SOURCE_FEATURES: readonly Feature[] = ZELT_FEATURES.filter(
  (feature) => feature !== 'test-setups',
);

const featureReportId = (feature: Feature, files: readonly string[]): string =>
  `report:${JSON.stringify([ZELT_PROVIDER, feature, 'source', files])}`;

const globalMiddlewareHints = (
  ctx: ZeltContext,
  globalMiddlewares: readonly ts.Expression[],
): readonly Material[] => {
  if (globalMiddlewares.length === 0) {
    note(
      ctx,
      'relations',
      'zelt-global-middleware-unresolved',
      'no built-in global middleware',
      [],
    );
  }
  const materials: Material[] = [];
  for (const element of globalMiddlewares) {
    const id = execIdOf(ctx, element, 'hints');
    if (id === null) continue;
    materials.push({
      kind: 'hint',
      subject: id,
      label: '全HTTP · core自動登録',
      evidence: evidenceOf(ctx, element),
    });
  }
  return materials;
};

const classAndRouteMaterials = (
  ctx: ZeltContext,
  prefix: readonly ChainEntry[],
): readonly Material[] => {
  const materials: Material[] = [];
  for (const cls of ctx.appClasses) {
    const facts = classFacts(ctx, cls);
    materials.push(...facts.materials);
    for (const route of facts.routes) materials.push(...routeFacts(ctx, route, prefix));
  }
  return materials;
};

const eventMaterials = (ctx: ZeltContext): readonly Material[] => {
  const busCalls = busCallsOf(ctx);
  const materials: Material[] = [];
  for (const call of busCalls) {
    if (call.kind !== 'subscribe') continue;
    materials.push(...subscriptionFacts(ctx, call, busCalls));
  }
  materials.push(...eventTypeMeanings(ctx));
  return materials;
};

const sourceReports = (
  ctx: ZeltContext,
  inspectedFiles: readonly string[],
): readonly AnalysisReport[] =>
  SOURCE_FEATURES.map((feature) => {
    const found = ctx.diagnostics.get(feature) ?? [];
    return {
      id: featureReportId(feature, ctx.input.config.raw.include),
      provider: ZELT_PROVIDER,
      feature,
      status: found.length > 0 ? 'partial' : 'complete-in-scope',
      scope: { files: ctx.input.config.raw.include, category: 'source' },
      inspectedFiles,
      diagnostics: found,
    };
  });

const testSetupReport = (
  input: ZeltInput,
  setups: TestSetupOutput,
  unitScopeFiles: readonly string[],
): AnalysisReport => ({
  id: `report:${JSON.stringify([ZELT_PROVIDER, 'test-setups', 'unit', unitScopeFiles])}`,
  provider: ZELT_PROVIDER,
  feature: 'test-setups',
  status: !input.setupDetails
    ? 'uncollected'
    : setups.diagnostics.length > 0
      ? 'partial'
      : 'complete-in-scope',
  scope: { files: unitScopeFiles, category: 'unit' },
  inspectedFiles: setups.inspectedFiles,
  diagnostics: setups.diagnostics,
});

/**
 * Zelt の登録規則を TS の静的解析で読み、意味・付与された線・注記・setup の材料を返す。
 * 事実の書き換えはせず、付与だけを行う(1節)。
 */
export const analyzeZelt = (input: ZeltInput): PluginResult => {
  const ctx = createZeltContext(input);
  const materials: Material[] = [];

  // 注記の順序を保つため、元の実行順(組込み → app → class/route → event → test setup)で進める
  const globalMiddlewares = globalMiddlewaresOf(ctx);
  materials.push(...globalMiddlewareHints(ctx, globalMiddlewares));

  const application = applicationFacts(ctx);
  materials.push(...application.materials);

  const prefix: readonly ChainEntry[] = [
    ...globalMiddlewares.map((expression) => ({ expression, evidence: expression })),
    ...application.appMiddlewares,
  ];
  materials.push(...classAndRouteMaterials(ctx, prefix));
  materials.push(...eventMaterials(ctx));

  const unitScopes = resolveScopes(
    input.program,
    ctx.config,
    ctx.resolver.relativePath,
    input.testScopes.filter((scope) => scope.category === 'unit'),
  );
  const setups = input.setupDetails
    ? analyzeZeltTestSetups({
        checker: ctx.checker,
        config: ctx.config,
        resolver: ctx.resolver,
        scopes: unitScopes,
      })
    : { materials: [], diagnostics: [], inspectedFiles: [] };
  materials.push(...setups.materials);

  const inspectedFiles = ctx.appFiles
    .map((file) => ctx.resolver.relativePath(file.fileName))
    .sort();
  return {
    revision: input.revision,
    materials,
    reports: [
      ...sourceReports(ctx, inspectedFiles),
      testSetupReport(
        input,
        setups,
        unitScopes.flatMap((scope) => scope.scope.files),
      ),
    ],
    ignoreRecommendations: ZELT_IGNORE_RECOMMENDATIONS,
  };
};
