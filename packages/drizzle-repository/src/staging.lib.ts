import { AsyncLocalStorage } from 'node:async_hooks';
import type { Result } from 'neverthrow';
import { err, ok } from 'neverthrow';

import { StagingDuplicateError } from './repository.errors';
import type { Row, SaveInput } from './repository.types';
import { valueKey } from './row.lib';

export type UniqueKeyDefinition = {
  readonly name: string;
  readonly columns: readonly string[];
};

// The part of a domain definition that staging reads.
type StagingDomain = {
  readonly name: string;
  readonly primaryKey: string;
  readonly uniqueKeys: readonly UniqueKeyDefinition[];
};

declare const models: unique symbol;

// A generated repository exposes its domain as `staging`. A scope keeps staged models by this
// object, so each repository reads exactly the models staged with its own key.
export type StagingKey<Model extends Row, NewModel extends Row> = StagingDomain & {
  readonly [models]?: { readonly model: Model; readonly newModel: NewModel };
};

export type StagedEntry = { readonly kind: 'save' | 'delete'; readonly model: Row };

type DomainStage = {
  readonly byPrimaryKey: Map<string, StagedEntry>;
  readonly byUniqueKey: Map<string, Map<string, StagedEntry>>;
};

type StagingState = Map<StagingDomain, DomainStage>;

const storage = new AsyncLocalStorage<StagingState>();

// A key containing NULL never collides, matching how SQL UNIQUE treats NULL.
const keyOf = (model: Row, columns: readonly string[]): string | undefined => {
  const values = columns.map((column) => model[column]);
  if (values.some((value) => value === null || value === undefined)) return undefined;
  return valueKey(values);
};

/** @throws {Error} when called outside withStagingScope */
const requireState = (): StagingState => {
  const state = storage.getStore();
  if (state === undefined) {
    throw new Error('stage() and stageDelete() must be called inside withStagingScope()');
  }
  return state;
};

const domainStageOf = (state: StagingState, domain: StagingDomain): DomainStage => {
  const existing = state.get(domain);
  if (existing !== undefined) return existing;
  const created: DomainStage = { byPrimaryKey: new Map(), byUniqueKey: new Map() };
  state.set(domain, created);
  return created;
};

type UniqueEntry = { readonly index: Map<string, StagedEntry>; readonly key: string };

const uniqueEntriesOf = (
  domain: StagingDomain,
  stage: DomainStage,
  entry: StagedEntry,
  uniqueKeys: readonly UniqueKeyDefinition[],
): Result<readonly UniqueEntry[], StagingDuplicateError> => {
  const entries: UniqueEntry[] = [];
  for (const uniqueKey of uniqueKeys) {
    const key = keyOf(entry.model, uniqueKey.columns);
    if (key === undefined) continue;
    const index = stage.byUniqueKey.get(uniqueKey.name) ?? new Map<string, StagedEntry>();
    if (index.has(key)) return err(new StagingDuplicateError(domain.name, uniqueKey.name));
    stage.byUniqueKey.set(uniqueKey.name, index);
    entries.push({ index, key });
  }
  return ok(entries);
};

/** @throws {Error} when called outside withStagingScope, or for a model without its primary key */
const putStaged = (
  domain: StagingDomain,
  entry: StagedEntry,
  uniqueKeys: readonly UniqueKeyDefinition[],
): Result<void, StagingDuplicateError> => {
  const stageOfDomain = domainStageOf(requireState(), domain);

  const primaryKey = keyOf(entry.model, [domain.primaryKey]);
  if (primaryKey === undefined) {
    throw new Error(`${domain.name} has no ${domain.primaryKey}`);
  }
  if (stageOfDomain.byPrimaryKey.has(primaryKey)) {
    return err(new StagingDuplicateError(domain.name, domain.primaryKey));
  }

  const uniqueEntries = uniqueEntriesOf(domain, stageOfDomain, entry, uniqueKeys);
  if (uniqueEntries.isErr()) return err(uniqueEntries.error);
  stageOfDomain.byPrimaryKey.set(primaryKey, entry);
  for (const { index, key } of uniqueEntries.value) index.set(key, entry);
  return ok(undefined);
};

/** @throws {Error} when called inside another staging scope */
export const withStagingScope = <T>(fn: () => Promise<T>): Promise<T> => {
  if (storage.getStore() !== undefined) {
    throw new Error('withStagingScope() cannot be nested');
  }
  return storage.run(new Map(), fn);
};

// The key alone decides the model types, so a value of another domain is a type error.
/** @throws {Error} when called outside withStagingScope */
export const stage = <Model extends Row, NewModel extends Row>(
  key: StagingKey<Model, NewModel>,
  value: NoInfer<SaveInput<Model, NewModel>>,
): Result<void, StagingDuplicateError> =>
  putStaged(key, { kind: 'save', model: value.input }, key.uniqueKeys);

/** @throws {Error} when called outside withStagingScope */
export const stageDelete = <Model extends Row, NewModel extends Row>(
  key: StagingKey<Model, NewModel>,
  model: NoInfer<Model>,
): Result<void, StagingDuplicateError> => putStaged(key, { kind: 'delete', model }, []);

export const findStagedByPrimaryKey = (
  domain: StagingDomain,
  id: unknown,
): StagedEntry | undefined =>
  storage
    .getStore()
    ?.get(domain)
    ?.byPrimaryKey.get(valueKey([id]));

export const findStagedByUniqueKey = (
  domain: StagingDomain,
  uniqueKey: string,
  values: readonly unknown[],
): StagedEntry | undefined =>
  storage.getStore()?.get(domain)?.byUniqueKey.get(uniqueKey)?.get(valueKey(values));
