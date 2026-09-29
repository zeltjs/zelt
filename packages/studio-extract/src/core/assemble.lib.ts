import { createHash } from 'node:crypto';
import type { AssemblyFailure, AssemblyInput, AssemblyResult } from './assemble.types';
import { publishGroups } from './assemble-groups.lib';
import type { MaterialContext } from './assemble-materials.lib';
import { collectMaterials } from './assemble-materials.lib';
import { assembleTests } from './assemble-tests.lib';
import type { SourceFacts } from './core-facts.types';
import type { ResolvedConfig } from './extract-config.lib';
import type { AnalysisReport } from './plugin.types';
import { canonicalJson, compare, relationIdOf } from './snapshot-canonical.lib';
import type { Meaning, SourceGroup, SourceRelation, StudioSnapshot } from './snapshot-schema.lib';

const byId = <T extends { readonly id: string }>(items: readonly T[]): Map<string, T> =>
  new Map(items.map((item) => [item.id, item]));

type Requirement = { readonly provider: string; readonly feature: string };

const reportsFor = (input: AssemblyInput, req: Requirement): readonly AnalysisReport[] =>
  input.plugins.flatMap((plugin) =>
    plugin.reports.filter(
      (report) => report.provider === req.provider && report.feature === req.feature,
    ),
  );

/**
 * required を満たせなかった理由は該当 report の diagnostics にしか無い。それを落とすと
 * 「complete-in-scope でない」だけが残り、子プロセスが起動できなかった等の原因が消える。
 */
const missingRequiredDetail = (reports: readonly AnalysisReport[]): string => {
  if (reports.length === 0) return 'no plugin reported it';
  return reports
    .map((report) =>
      [report.status, ...report.diagnostics.map((d) => `${d.code} ${d.message}`)].join(': '),
    )
    .join('; ');
};

const missingRequiredFailures = (input: AssemblyInput): AssemblyFailure[] =>
  (input.enforceRequired === false ? [] : input.config.raw.required)
    .map((req) => ({ req, reports: reportsFor(input, req) }))
    .filter(({ reports }) => !reports.some((report) => report.status === 'complete-in-scope'))
    .map(({ req, reports }) => ({
      code: 'required-feature-missing',
      message: `required feature is not complete-in-scope: ${req.provider}/${req.feature} (${missingRequiredDetail(reports)})`,
    }));

const relationsBySubjectOf = (
  facts: SourceFacts,
  subjectExists: (id: string) => boolean,
  relationMeanings: ReadonlyMap<string, Meaning[]>,
  failures: AssemblyFailure[],
): Map<string, SourceRelation[]> => {
  const out = new Map<string, SourceRelation[]>();
  for (const relation of facts.relations) {
    if (!subjectExists(relation.to)) {
      failures.push({
        code: 'dangling-relation',
        message: `relation points at a subject that is not published: ${relation.to}`,
      });
      continue;
    }
    const id = relationIdOf(relation.ownerId, relation.to, relation.kind);
    const list = out.get(relation.ownerId) ?? [];
    list.push({
      id,
      origin: 'ts',
      to: relation.to,
      kind: relation.kind,
      meanings: relationMeanings.get(id) ?? [],
      evidence: [...relation.evidence].sort(
        (a, b) =>
          a.location.startLine - b.location.startLine || compare(a.expression, b.expression),
      ),
    });
    out.set(relation.ownerId, list);
  }
  return out;
};

const snapshotOf = (config: ResolvedConfig, groups: SourceGroup[]): StudioSnapshot => {
  const usedColumns = new Set(groups.map((group) => group.presentation.columnId));
  const snapshot: StudioSnapshot = {
    schemaVersion: 1,
    snapshotId: '',
    project: config.raw.project,
    provenance: 'extracted',
    graph: {
      groups,
      presentation: {
        id: config.raw.presentation.id,
        // groupの無い列は配信しない(付録A)
        columns: config.raw.presentation.columns.filter((column) => usedColumns.has(column.id)),
      },
    },
  };
  const snapshotId = createHash('sha256')
    .update(canonicalJson({ ...snapshot, snapshotId: undefined }))
    .digest('hex');
  return { ...snapshot, snapshotId };
};

/**
 * Build the v1 JSON from core facts and plugin materials. Contradictions stop the
 * whole snapshot (all or nothing); nothing is silently dropped.
 */
export const assemble = (input: AssemblyInput): AssemblyResult => {
  const { config, facts } = input;
  const groups = byId(facts.groups);
  const declarations = byId(facts.declarations);
  const subjectExists = (id: string): boolean => groups.has(id) || declarations.has(id);

  const materialContext: MaterialContext = {
    subjectExists,
    coreRelationIds: new Set(facts.relations.map((r) => relationIdOf(r.ownerId, r.to, r.kind))),
    corePairs: new Set(facts.relations.map((r) => `${r.ownerId}\u0000${r.to}`)),
    evidenceOf: (spans) =>
      spans.map((e) => ({
        location: {
          filePath: e.span.filePath,
          startLine: e.span.startLine,
          endLine: e.span.endLine,
        },
        expression: input.readSpan(e.span),
      })),
  };

  const materials = collectMaterials(input.plugins, materialContext);
  const failures: AssemblyFailure[] = [...materials.failures, ...missingRequiredFailures(input)];
  const relationsBySubject = relationsBySubjectOf(
    facts,
    subjectExists,
    materials.relationMeanings,
    failures,
  );

  const tests = assembleTests(input.plugins);
  failures.push(...tests.failures);
  if (failures.length > 0) return { ok: false, failures };

  const published = publishGroups({
    facts,
    buckets: materials.buckets,
    relationsBySubject,
    tests,
    columnIdFor: config.columnIdFor,
  });
  return { ok: true, snapshot: snapshotOf(config, published) };
};
