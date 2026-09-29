import type { AnalysisReport, Feature, Material, PluginResult } from '../core';
import { resolveScopes } from '../core';
import type { ZeltApplicationConfig, ZeltContext, ZeltInput } from './zelt.types';
import { blueprintMaterials, ZELT_PROVIDER } from './zelt-blueprint.lib';
import { createZeltContext, note, ZELT_FEATURES } from './zelt-context.lib';
import { busCallsOf, eventTypeMeanings, subscriptionFacts } from './zelt-eventbus.lib';
import { runZeltInspect } from './zelt-inspect-runner.lib';
import { lifecycleSetups } from './zelt-lifecycle.lib';
import { ZELT_IGNORE_RECOMMENDATIONS } from './zelt-runtime.lib';
import type { TestSetupOutput } from './zelt-test-setup.lib';
import { analyzeZeltTestSetups } from './zelt-test-setup.lib';

export type { ZeltApplicationConfig, ZeltInput } from './zelt.types';
export { ZELT_PROVIDER } from './zelt-blueprint.lib';
export { ZELT_FEATURES } from './zelt-context.lib';

/** source を見る feature。test-setups だけは config の Unit scope を範囲にする */
const SOURCE_FEATURES: readonly Feature[] = ZELT_FEATURES.filter(
  (feature) => feature !== 'test-setups',
);

const featureReportId = (feature: Feature, files: readonly string[]): string =>
  `report:${JSON.stringify([ZELT_PROVIDER, feature, 'source', files])}`;

/**
 * app を子プロセスで読み込み、runtime の記録をコアの宣言に結んで材料にする。
 * 子プロセスが答えない・壊れた答えを返したときは、全 feature を partial にして
 * 生成を止める(付録I の all or nothing)。
 */
const applicationMaterials = async (
  ctx: ZeltContext,
  application: ZeltApplicationConfig,
): Promise<readonly Material[]> => {
  const result = await runZeltInspect({
    request: {
      root: ctx.config.root,
      applicationId: application.id,
      app: application.app,
      tsconfig: ctx.config.tsconfig,
    },
    entryPath: ctx.input.entryPath,
    timeoutMs: ctx.input.timeoutMs,
  });
  if (!result.ok) {
    for (const feature of SOURCE_FEATURES) {
      note(ctx, feature, 'zelt-inspect-failed', `${application.id}: ${result.errorOutput}`, []);
    }
    return [];
  }
  for (const diagnostic of result.inspection.diagnostics) {
    note(ctx, 'relations', diagnostic.code, diagnostic.message, []);
  }
  return blueprintMaterials({
    config: ctx.config,
    resolver: ctx.resolver,
    inspection: result.inspection,
    note: (feature, code, message, spans) => {
      note(ctx, feature, code, message, spans);
    },
  });
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
 * Zelt の runtime の記録(blueprint と decorator metadata)から、意味・付与された線・
 * 注記・setup の材料を返す。事実の書き換えはせず、付与だけを行う(1節)。
 */
export const analyzeZelt = async (input: ZeltInput): Promise<PluginResult> => {
  const ctx = createZeltContext(input);
  const materials: Material[] = [];

  for (const application of input.applications) {
    materials.push(...(await applicationMaterials(ctx, application)));
  }
  materials.push(...lifecycleSetups(ctx));
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
