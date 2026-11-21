import { AsyncLocalStorage } from 'node:async_hooks';
import type { Result } from 'neverthrow';
import { err, ok } from 'neverthrow';

import { StagingDuplicateError } from './repository.errors';
import type { Row } from './repository.types';
import { serializeKey, toRow } from './row.lib';

// Generated model files add one entry per domain through declaration merging.
// biome-ignore lint/suspicious/noEmptyInterface: generated model files fill it through declaration merging
export interface StagingModels {}

type StagingModelName = keyof StagingModels & string;

type SaveOf<N extends StagingModelName> = StagingModels[N] extends { save: infer S } ? S : never;
type ModelOf<N extends StagingModelName> = StagingModels[N] extends { model: infer M } ? M : never;

export type UniqueKeyDefinition = {
  readonly name: string;
  readonly columns: readonly string[];
};

type StagingDefinition = {
  readonly primaryKey: string;
  readonly uniqueKeys: readonly UniqueKeyDefinition[];
};

export type StagedEntry = { readonly kind: 'save' | 'delete'; readonly model: Row };

type ModelStage = {
  readonly byPrimaryKey: Map<string, StagedEntry>;
  readonly byUniqueKey: Map<string, Map<string, StagedEntry>>;
};

type StagingState = Map<string, ModelStage>;

const storage = new AsyncLocalStorage<StagingState>();

// Filled when a generated repository module is loaded; stage() needs the keys of a model by its name.
const definitions = new Map<string, StagingDefinition>();

export const registerStagingDefinition = (model: string, definition: StagingDefinition): void => {
  definitions.set(model, definition);
};

// A key containing NULL never collides, matching how SQL UNIQUE treats NULL.
const keyOf = (model: Row, columns: readonly string[]): string | undefined => {
  const values = columns.map((column) => model[column]);
  if (values.some((value) => value === null || value === undefined)) return undefined;
  return serializeKey(values);
};

/** @throws {Error} when called outside withStagingScope */
const requireState = (): StagingState => {
  const state = storage.getStore();
  if (state === undefined) {
    throw new Error('stage() and stageDelete() must be called inside withStagingScope()');
  }
  return state;
};

/** @throws {Error} when no generated repository registered the model */
const requireDefinition = (model: string): StagingDefinition => {
  const definition = definitions.get(model);
  if (definition === undefined) {
    throw new Error(`${model} is not a generated domain. Import its repository before staging it`);
  }
  return definition;
};

/** @throws {Error} when the value is not a model object */
const requireRow = (model: string, value: unknown): Row => {
  const row = toRow(value);
  if (row === undefined) throw new Error(`${model}: a staged model must be an object`);
  return row;
};

const modelStageOf = (state: StagingState, model: string): ModelStage => {
  const existing = state.get(model);
  if (existing !== undefined) return existing;
  const created: ModelStage = { byPrimaryKey: new Map(), byUniqueKey: new Map() };
  state.set(model, created);
  return created;
};

type UniqueEntry = { readonly index: Map<string, StagedEntry>; readonly key: string };

const uniqueEntriesOf = (
  model: string,
  stage: ModelStage,
  entry: StagedEntry,
  uniqueKeys: readonly UniqueKeyDefinition[],
): Result<readonly UniqueEntry[], StagingDuplicateError> => {
  const entries: UniqueEntry[] = [];
  for (const uniqueKey of uniqueKeys) {
    const key = keyOf(entry.model, uniqueKey.columns);
    if (key === undefined) continue;
    const index = stage.byUniqueKey.get(uniqueKey.name) ?? new Map<string, StagedEntry>();
    if (index.has(key)) return err(new StagingDuplicateError(model, uniqueKey.name));
    stage.byUniqueKey.set(uniqueKey.name, index);
    entries.push({ index, key });
  }
  return ok(entries);
};

/** @throws {Error} when called outside withStagingScope, or for a model without its primary key */
const putStaged = (
  model: string,
  entry: StagedEntry,
  uniqueKeys: readonly UniqueKeyDefinition[],
): Result<void, StagingDuplicateError> => {
  const definition = requireDefinition(model);
  const stageOfModel = modelStageOf(requireState(), model);

  const primaryKey = keyOf(entry.model, [definition.primaryKey]);
  if (primaryKey === undefined) {
    throw new Error(`${model} has no ${definition.primaryKey}`);
  }
  if (stageOfModel.byPrimaryKey.has(primaryKey)) {
    return err(new StagingDuplicateError(model, definition.primaryKey));
  }

  const uniqueEntries = uniqueEntriesOf(model, stageOfModel, entry, uniqueKeys);
  if (uniqueEntries.isErr()) return err(uniqueEntries.error);
  stageOfModel.byPrimaryKey.set(primaryKey, entry);
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

/** @throws {Error} when called outside withStagingScope */
export const stage = <N extends StagingModelName>(
  model: N,
  value: SaveOf<N>,
): Result<void, StagingDuplicateError> => {
  const input = requireRow(
    model,
    typeof value === 'object' && value !== null ? Reflect.get(value, 'input') : undefined,
  );
  return putStaged(model, { kind: 'save', model: input }, requireDefinition(model).uniqueKeys);
};

/** @throws {Error} when called outside withStagingScope */
export const stageDelete = <N extends StagingModelName>(
  model: N,
  value: ModelOf<N>,
): Result<void, StagingDuplicateError> =>
  putStaged(model, { kind: 'delete', model: requireRow(model, value) }, []);

export const findStagedByPrimaryKey = (model: string, id: unknown): StagedEntry | undefined =>
  storage
    .getStore()
    ?.get(model)
    ?.byPrimaryKey.get(serializeKey([id]));

export const findStagedByUniqueKey = (
  model: string,
  uniqueKey: string,
  values: readonly unknown[],
): StagedEntry | undefined =>
  storage.getStore()?.get(model)?.byUniqueKey.get(uniqueKey)?.get(serializeKey(values));
