import type { GraphQLSchema } from 'graphql';
import { GraphQLObjectType } from 'graphql';
import type { GraphqlModelBinding, GraphqlModelFields, GraphqlModels } from './graphql-model.types';
import { parseGraphqlModelManifest } from './graphql-model-manifest.lib';
import { renderGraphqlModelProperty, renderGraphqlModelResult } from './graphql-model-shape.lib';

type ModelRuntime = {
  readonly models?: GraphqlModels;
  readonly modelFields?: GraphqlModelFields;
  readonly bindings: Readonly<Record<string, Readonly<Record<string, GraphqlModelBinding>>>>;
};

/**
 * @throws {Error} from graphql-model-schema.lib.ts:validateSources
 */
const validateSources = (models: GraphqlModels, schema: GraphQLSchema): void => {
  for (const [name, model] of Object.entries(models)) {
    const type = schema.getType(name);
    if (!(type instanceof GraphQLObjectType))
      throw new Error(`GraphQL model type missing: ${name}`);
    const fields = type.getFields();
    for (const property of model.properties) {
      if (property.name.startsWith('$')) continue;
      const field = fields[property.name];
      if (!field) throw new Error(`GraphQL model source field missing: ${name}.${property.name}`);
      if (String(field.type) !== renderGraphqlModelProperty(property)) {
        throw new Error(`GraphQL model source type mismatch: ${name}.${property.name}`);
      }
    }
  }
};

/**
 * @throws {Error} from graphql-model-schema.lib.ts:validateFieldBindings
 */
const validateFieldBindings = (
  name: string,
  definitions: GraphqlModelFields[string],
  schemaFields: ReturnType<GraphQLObjectType['getFields']>,
  bindings: Readonly<Record<string, GraphqlModelBinding>>,
): void => {
  for (const [field, definition] of Object.entries(definitions)) {
    const schemaField = schemaFields[field];
    if (!schemaField || !bindings[field])
      throw new Error(`GraphQL model field binding missing: ${name}.${field}`);
    if (definition.kind === 'computed') continue;
    if (
      String(schemaField.type) !== renderGraphqlModelResult(definition.target, definition.shape)
    ) {
      throw new Error(`GraphQL model reference type mismatch: ${name}.${field}`);
    }
  }
};

/**
 * @throws {Error} from graphql-model-schema.lib.ts:validateBindings
 */
const validateBindings = (
  runtime: ModelRuntime,
  fields: GraphqlModelFields,
  schema: GraphQLSchema,
): void => {
  for (const [name, definitions] of Object.entries(fields)) {
    const type = schema.getType(name);
    if (!(type instanceof GraphQLObjectType))
      throw new Error(`GraphQL model type missing: ${name}`);
    const schemaFields = type.getFields();
    const bindings = runtime.bindings[name] ?? {};
    validateFieldBindings(name, definitions, schemaFields, bindings);
  }
};

/**
 * @throws {Error} from graphql-model-schema.lib.ts:validateGraphqlModelSchema
 */
export const validateGraphqlModelSchema = (runtime: ModelRuntime, schema: GraphQLSchema): void => {
  if (runtime.models === undefined && runtime.modelFields === undefined) return;
  const parsed = parseGraphqlModelManifest(runtime.models, runtime.modelFields);
  if (!parsed) throw new Error('Invalid GraphQL model manifest; rebuild the endpoint');
  validateSources(parsed.models, schema);
  validateBindings(runtime, parsed.modelFields, schema);
};
