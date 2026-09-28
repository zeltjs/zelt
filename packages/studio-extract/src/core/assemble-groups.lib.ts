import type { Bucket } from './assemble.types';
import { emptyBucket } from './assemble-materials.lib';
import type { TestAssembly } from './assemble-tests.lib';
import { NO_UNIT_TESTS } from './assemble-tests.lib';
import type { CoreDeclaration, SourceFacts } from './core-facts.types';
import { compare } from './snapshot-canonical.lib';
import type { Hint, SourceDeclaration, SourceGroup, SourceRelation } from './snapshot-schema.lib';

export type PublishContext = {
  readonly facts: SourceFacts;
  readonly buckets: ReadonlyMap<string, Bucket>;
  readonly relationsBySubject: ReadonlyMap<string, SourceRelation[]>;
  readonly tests: TestAssembly;
  readonly columnIdFor: (filePath: string) => string;
};

const byProvider = (a: { readonly provider: string }, b: { readonly provider: string }): number =>
  compare(a.provider, b.provider);

const byProviderThenLabel = (a: Hint, b: Hint): number =>
  compare(a.provider, b.provider) || compare(a.label, b.label);

const relationsOf = (ctx: PublishContext, id: string): SourceRelation[] =>
  [...(ctx.relationsBySubject.get(id) ?? []), ...(ctx.buckets.get(id)?.granted ?? [])].sort(
    (a, b) => compare(a.id, b.id),
  );

const memberOf = (
  ctx: PublishContext,
  decl: CoreDeclaration,
  expansion: 'included' | 'boundary',
): SourceDeclaration => {
  const bucket = ctx.buckets.get(decl.id) ?? emptyBucket();
  return {
    id: decl.id,
    name: decl.name,
    kind: decl.kind,
    meanings: [...bucket.meanings].sort(byProvider),
    enclosingDeclarationId: decl.enclosingDeclarationId,
    relations: relationsOf(ctx, decl.id),
    setup: [...bucket.setup].sort(byProvider),
    source: decl.source,
    // ライブラリ自身の test は収録しないので、境界の箱は未取得のままにする(4.2)
    unitTests: expansion === 'included' ? ctx.tests.unitTestsOf(decl.id) : NO_UNIT_TESTS,
    e2eTests: ctx.tests.e2eTestsOf(decl.id),
    unresolved: [],
    hints: [...bucket.hints].sort(byProviderThenLabel),
  };
};

const membersOf = (
  ctx: PublishContext,
  groupId: string,
  expansion: 'included' | 'boundary',
): SourceDeclaration[] =>
  ctx.facts.declarations
    .filter((decl) => decl.groupId === groupId)
    .sort((a, b) => a.position - b.position)
    .map((decl) => memberOf(ctx, decl, expansion));

export const publishGroups = (ctx: PublishContext): SourceGroup[] =>
  [...ctx.facts.groups]
    .sort((a, b) => compare(a.filePath, b.filePath) || a.position - b.position)
    .map((group) => {
      const bucket = ctx.buckets.get(group.id) ?? emptyBucket();
      return {
        id: group.id,
        name: group.name,
        kind: group.kind,
        filePath: group.filePath,
        members: membersOf(ctx, group.id, group.expansion),
        relations: relationsOf(ctx, group.id),
        setup: [...bucket.setup].sort(byProvider),
        expansion: group.expansion,
        source: group.source,
        unresolved: [],
        hints: [...bucket.hints].sort(byProviderThenLabel),
        presentation: { columnId: ctx.columnIdFor(group.filePath) },
      };
    });
