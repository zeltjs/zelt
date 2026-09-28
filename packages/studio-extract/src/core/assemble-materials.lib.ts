import type { AssemblyFailure, Bucket, PluginContribution } from './assemble.types';
import type { Material, ProviderId, Span } from './plugin.types';
import { relationIdOf } from './snapshot-canonical.lib';
import type { Meaning, RelationEvidence } from './snapshot-schema.lib';

/** 材料を受け取るのに要る、コア側の事実だけの窓口 */
export type MaterialContext = {
  readonly subjectExists: (id: string) => boolean;
  readonly coreRelationIds: ReadonlySet<string>;
  readonly corePairs: ReadonlySet<string>;
  readonly evidenceOf: (spans: readonly { readonly span: Span }[]) => RelationEvidence[];
};

export type MaterialIndex = {
  readonly buckets: Map<string, Bucket>;
  readonly relationMeanings: Map<string, Meaning[]>;
  readonly failures: AssemblyFailure[];
};

export const emptyBucket = (): Bucket => ({ meanings: [], hints: [], setup: [], granted: [] });

const bucketOf = (index: MaterialIndex, id: string): Bucket => {
  const existing = index.buckets.get(id);
  if (existing !== undefined) return existing;
  const created = emptyBucket();
  index.buckets.set(id, created);
  return created;
};

const unknownSubject = (provider: ProviderId, what: string, subject: string): AssemblyFailure => ({
  code: 'unknown-subject',
  message: `${provider} granted a ${what} to an unknown subject: ${subject}`,
});

type MaterialOf<K extends Material['kind']> = Extract<Material, { kind: K }>;

const addMeaning = (
  index: MaterialIndex,
  ctx: MaterialContext,
  provider: ProviderId,
  material: MaterialOf<'meaning'>,
): void => {
  if (!ctx.subjectExists(material.subject) && !ctx.coreRelationIds.has(material.subject)) {
    index.failures.push(unknownSubject(provider, 'meaning', material.subject));
    return;
  }
  const meaning: Meaning = { provider, kind: material.meaning };
  if (ctx.subjectExists(material.subject)) {
    bucketOf(index, material.subject).meanings.push(meaning);
    return;
  }
  const list = index.relationMeanings.get(material.subject) ?? [];
  list.push(meaning);
  index.relationMeanings.set(material.subject, list);
};

const addHint = (
  index: MaterialIndex,
  ctx: MaterialContext,
  provider: ProviderId,
  material: MaterialOf<'hint'>,
): void => {
  if (!ctx.subjectExists(material.subject)) {
    index.failures.push(unknownSubject(provider, 'hint', material.subject));
    return;
  }
  bucketOf(index, material.subject).hints.push({ provider, label: material.label });
};

const addSetup = (
  index: MaterialIndex,
  ctx: MaterialContext,
  provider: ProviderId,
  material: MaterialOf<'setup'>,
): void => {
  if (!ctx.subjectExists(material.subject)) {
    index.failures.push(unknownSubject(provider, 'setup', material.subject));
    return;
  }
  bucketOf(index, material.subject).setup.push({
    provider,
    kind: material.setup,
    label: material.label,
    target: material.target,
    evidence: ctx.evidenceOf(material.evidence),
  });
};

const mergeEvidence = (
  existing: readonly RelationEvidence[],
  added: readonly RelationEvidence[],
): RelationEvidence[] => {
  const merged = [...existing];
  for (const item of added) {
    const duplicate = merged.some(
      (e) =>
        e.location.filePath === item.location.filePath &&
        e.location.startLine === item.location.startLine &&
        e.expression === item.expression,
    );
    if (!duplicate) merged.push(item);
  }
  return merged;
};

const earliestOrder = (left: number | null, right: number | null): number | null => {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
};

const addRelation = (
  index: MaterialIndex,
  ctx: MaterialContext,
  provider: ProviderId,
  material: MaterialOf<'relation'>,
): void => {
  if (!ctx.subjectExists(material.from) || !ctx.subjectExists(material.to)) {
    index.failures.push({
      code: 'unknown-subject',
      message: `${provider} granted a relation between unknown subjects: ${material.from} -> ${material.to}`,
    });
    return;
  }
  if (ctx.corePairs.has(`${material.from}\u0000${material.to}`)) {
    index.failures.push({
      code: 'duplicate-relation',
      message: `${provider} granted a relation that core already states: ${material.from} -> ${material.to}`,
    });
    return;
  }
  const id = relationIdOf(material.from, material.to, `${provider}:${material.relation}`);
  const granted = bucketOf(index, material.from).granted;
  const existing = granted.find((relation) => relation.id === id);
  // 同じ所有者・to・provider・kind は1本に併合し、根拠だけ足す(付録I)
  if (existing !== undefined) {
    granted[granted.indexOf(existing)] = {
      ...existing,
      // 併合後も「最も早く通る位置」を残す(付録A)
      order: earliestOrder(existing.order, material.order),
      evidence: mergeEvidence(existing.evidence, ctx.evidenceOf(material.evidence)),
    };
    return;
  }
  granted.push({
    id,
    origin: 'plugin',
    to: material.to,
    provider,
    kind: material.relation,
    order: material.order,
    evidence: ctx.evidenceOf(material.evidence),
  });
};

const addMaterial = (
  index: MaterialIndex,
  ctx: MaterialContext,
  provider: ProviderId,
  material: Material,
): void => {
  if (material.kind === 'meaning') {
    addMeaning(index, ctx, provider, material);
    return;
  }
  if (material.kind === 'hint') {
    addHint(index, ctx, provider, material);
    return;
  }
  if (material.kind === 'setup') {
    addSetup(index, ctx, provider, material);
    return;
  }
  if (material.kind === 'relation') addRelation(index, ctx, provider, material);
};

/** plugin が足した意味・注記・setup・線を主題ごとに集める。矛盾は failures に残す */
export const collectMaterials = (
  plugins: readonly PluginContribution[],
  ctx: MaterialContext,
): MaterialIndex => {
  const index: MaterialIndex = {
    buckets: new Map(),
    relationMeanings: new Map(),
    failures: [],
  };
  for (const plugin of plugins) {
    for (const material of plugin.materials) addMaterial(index, ctx, plugin.id, material);
  }
  return index;
};
