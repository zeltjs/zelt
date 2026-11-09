import type {
  GraphqlModelBinding,
  GraphqlModelDefinition,
  GraphqlModelField,
  GraphqlModelProperty,
} from './graphql-model.types';
import type { ModelTypeReader } from './graphql-model-checker.lib';
import type { ModelDeclaration } from './graphql-model-declaration.lib';
import {
  isScalarId,
  readModelDeclaration,
  readModelProperty,
} from './graphql-model-declaration.lib';
import type { ModelMethod } from './graphql-model-method.lib';
import type { ModelOperation } from './graphql-model-operation.lib';
import type { Result } from './graphql-model-read.lib';
import { andThen, ok, rejected } from './graphql-model-read.lib';

type Type = import('typescript').Type;

type Resolved = { readonly field: GraphqlModelField; readonly binding: GraphqlModelBinding };

/** Every model with its definition, and every GraphQL field with the method resolving it. */
export type ModelContract = {
  readonly models: ReadonlyMap<string, GraphqlModelDefinition>;
  readonly fields: ReadonlyMap<string, ReadonlyMap<string, Resolved>>;
};

type Model = { readonly declaration: ModelDeclaration; readonly origin: ModelMethod };
type Models = ReadonlyMap<Type, Model>;
type Provider = Extract<ModelOperation, { kind: 'provider' }>;
type FieldOperation = Exclude<ModelOperation, Provider>;
type Definitions = ReadonlyMap<Type, GraphqlModelDefinition>;
type Fields = Map<string, Map<string, Resolved>>;

const at = (method: ModelMethod, reason: string): Result<never> =>
  rejected(`${method.resolver}.${method.name}: ${reason}`);

const nameOf = (models: Models, type: Type): string => models.get(type)?.declaration.name ?? '';

const referencedModels = (operation: ModelOperation): readonly Type[] => {
  if (operation.kind === 'query') return [operation.reference.model];
  if (operation.kind === 'relation') return [operation.parent.ref.model, operation.target];
  return [operation.parent.ref.model];
};

/** Model types become GraphQL types under their own name, so names must be unique. */
const collectModels = (
  operations: readonly ModelOperation[],
  reader: ModelTypeReader,
): Result<Models> => {
  const models = new Map<Type, Model>();
  const names = new Set<string>();
  for (const operation of operations) {
    for (const type of referencedModels(operation).filter((model) => !models.has(model))) {
      const declaration = readModelDeclaration(type, reader);
      if (declaration.kind === 'rejected') return at(operation.method, declaration.reason);
      const { name } = declaration.value;
      if (names.has(name))
        return at(operation.method, `another model type is already named ${name}`);
      names.add(name);
      models.set(type, { declaration: declaration.value, origin: operation.method });
    }
  }
  return ok(models);
};

/** A model has at most one provider. */
const collectProviders = (
  operations: readonly ModelOperation[],
  models: Models,
): Result<ReadonlyMap<Type, Provider>> => {
  const providers = new Map<Type, Provider>();
  for (const operation of operations) {
    if (operation.kind !== 'provider') continue;
    const { model } = operation.parent.ref;
    if (providers.has(model))
      return at(operation.method, `duplicate provider for model ${nameOf(models, model)}`);
    providers.set(model, operation);
  }
  return ok(providers);
};

/** The properties a reference is hydrated with; they always include a scalar id. */
const hydratedProperties = (
  model: Model,
  method: ModelMethod,
  keys: readonly string[],
  reader: ModelTypeReader,
): Result<readonly GraphqlModelProperty[]> => {
  const properties: GraphqlModelProperty[] = [];
  for (const key of keys) {
    const property = readModelProperty(model.declaration, key, reader);
    if (property.kind === 'rejected') return at(method, property.reason);
    properties.push(property.value);
  }
  if (!properties.some(isScalarId))
    return at(method, `model ${model.declaration.name} requires a non-null scalar id`);
  return ok(properties);
};

/** A model with a provider is hydrated from it; without one, only its id is known. */
const defineModel = (
  model: Model,
  provider: Provider | undefined,
  reader: ModelTypeReader,
): Result<GraphqlModelDefinition> => {
  if (!provider)
    return andThen(hydratedProperties(model, model.origin, ['id'], reader), (properties) =>
      ok({ kind: 'identity', properties }),
    );
  return andThen(
    hydratedProperties(model, provider.method, provider.supplies, reader),
    (properties) =>
      ok({
        kind: 'provided',
        provider: { resolver: provider.method.resolver, method: provider.method.name },
        mode: provider.parent.batch ? 'batch' : 'single',
        properties,
      }),
  );
};

const defineModels = (
  models: Models,
  providers: ReadonlyMap<Type, Provider>,
  reader: ModelTypeReader,
): Result<Definitions> => {
  const definitions = new Map<Type, GraphqlModelDefinition>();
  for (const [type, model] of models) {
    const definition = defineModel(model, providers.get(type), reader);
    if (definition.kind === 'rejected') return definition;
    definitions.set(type, definition.value);
  }
  return ok(definitions);
};

/** The GraphQL field an operation resolves and the type that owns it. */
const fieldOf = (
  operation: FieldOperation,
  models: Models,
): { readonly owner: string; readonly field: GraphqlModelField } => {
  if (operation.kind === 'query') {
    const { model, shape } = operation.reference;
    return { owner: 'Query', field: { kind: 'query', target: nameOf(models, model), shape } };
  }
  const owner = nameOf(models, operation.parent.ref.model);
  const mode = operation.parent.batch ? 'batch' : 'single';
  const dependencies = [...operation.parent.ref.keys];
  if (operation.kind === 'computed')
    return { owner, field: { kind: 'computed', dependencies, mode, value: operation.value } };
  const target = nameOf(models, operation.target);
  return { owner, field: { kind: 'relation', target, shape: operation.shape, dependencies, mode } };
};

/** A field method resolves what the provider does not supply, from what it does supply. */
const checkAgainstSupply = (
  operation: FieldOperation,
  owner: string,
  definitions: Definitions,
): Result<null> => {
  if (operation.kind === 'query') return ok(null);
  const { method, parent } = operation;
  const names = (definitions.get(parent.ref.model)?.properties ?? []).map(({ name }) => name);
  if (names.includes(method.fieldName))
    return at(
      method,
      `duplicate field ${owner}.${method.fieldName}: the provider already supplies it`,
    );
  const unknown = parent.ref.keys.find((key) => !names.includes(key));
  if (unknown !== undefined)
    return at(method, `unknown source dependency ${unknown}: ${owner} does not supply it`);
  return ok(null);
};

const collectFields = (
  operations: readonly ModelOperation[],
  models: Models,
  definitions: Definitions,
): Result<Fields> => {
  const fields: Fields = new Map();
  for (const operation of operations) {
    if (operation.kind === 'provider') continue;
    const { method } = operation;
    const { owner, field } = fieldOf(operation, models);
    const supply = checkAgainstSupply(operation, owner, definitions);
    if (supply.kind === 'rejected') return supply;
    const owned = fields.get(owner) ?? new Map<string, Resolved>();
    if (owned.has(method.fieldName))
      return at(method, `duplicate field ${owner}.${method.fieldName}`);
    owned.set(method.fieldName, {
      field,
      binding: { resolver: method.resolver, method: method.name },
    });
    fields.set(owner, owned);
  }
  return ok(fields);
};

/** Every declared property is resolved: supplied by the provider or by a field method. */
const checkComplete = (models: Models, definitions: Definitions, fields: Fields): Result<null> => {
  for (const [type, { declaration, origin }] of models) {
    const names = (definitions.get(type)?.properties ?? []).map(({ name }) => name);
    const resolved = fields.get(declaration.name);
    const missing = [...declaration.properties.keys()].find(
      (name) => !names.includes(name) && !resolved?.has(name),
    );
    if (missing !== undefined)
      return at(
        origin,
        `${declaration.name}.${missing} has no resolver; supply it from @ResolveMultiField or resolve it with @ResolveField / @Relation`,
      );
  }
  return ok(null);
};

const namedDefinitions = (
  models: Models,
  definitions: Definitions,
): ReadonlyMap<string, GraphqlModelDefinition> => {
  const named = new Map<string, GraphqlModelDefinition>();
  for (const [type, definition] of definitions) named.set(nameOf(models, type), definition);
  return named;
};

/** Combines the operations of all model resolvers so that each property has exactly one owner. */
export const resolveOwnership = (
  operations: readonly ModelOperation[],
  reader: ModelTypeReader,
): Result<ModelContract> =>
  andThen(collectModels(operations, reader), (models) =>
    andThen(collectProviders(operations, models), (providers) =>
      andThen(defineModels(models, providers, reader), (definitions) =>
        andThen(collectFields(operations, models, definitions), (fields) =>
          andThen(checkComplete(models, definitions, fields), () =>
            ok({ models: namedDefinitions(models, definitions), fields }),
          ),
        ),
      ),
    ),
  );
