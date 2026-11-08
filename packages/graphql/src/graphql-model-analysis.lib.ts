import type { ClassMetadata } from '@zeltjs/decorator-metadata/inspect';
import { extractGraphqlArgsRef } from './analyze-gql-args.lib';
import type {
  GraphqlModelDefinition,
  GraphqlModelField,
  GraphqlModelProperty,
  GraphqlModelResultShape,
  GraphqlModelValue,
} from './graphql-model.types';
import type { ModelRef, ModelTypeReader, ReferenceType } from './graphql-model-type.lib';
import {
  arrayElement,
  awaited,
  isPromiseLike,
  isPublicValue,
  mapEntry,
  modelName,
  modelRef,
  modelValue,
  referenceType,
  withoutNullish,
} from './graphql-model-type.lib';
import { readOwnEntry } from './graphql-record.lib';

type Type = import('typescript').Type;
type Symbol = import('typescript').Symbol;
type Method = import('typescript').MethodDeclaration;

export type ModelResolverInput = {
  readonly resolver: string;
  readonly metadata: ClassMetadata;
  readonly classNode: import('typescript').ClassDeclaration;
  readonly checker: import('typescript').TypeChecker;
  readonly ts: typeof import('typescript');
};
export type ModelAnalysis = {
  readonly models: Record<string, GraphqlModelDefinition>;
  readonly fields: Record<string, Record<string, GraphqlModelField>>;
  readonly modelResolvers: ReadonlySet<string>;
  readonly bindings: Record<string, Record<string, { resolver: string; method: string }>>;
};

const OPERATION_KINDS = [
  'query',
  'mutation',
  'resolveField',
  'relation',
  'resolveMultiField',
] as const;
type OperationKind = (typeof OPERATION_KINDS)[number];

type Site = {
  readonly input: ModelResolverInput;
  readonly reader: ModelTypeReader;
  readonly method: Method;
  readonly methodName: string;
  readonly kind: OperationKind;
  readonly fieldName: string;
};
type Parent = { readonly ref: ModelRef; readonly batch: boolean };
type Model = {
  readonly name: string;
  readonly type: Type;
  readonly origin: Site;
  readonly declared: ReadonlyMap<string, Symbol>;
};
type Provider = { readonly site: Site; readonly batch: boolean; readonly keys: readonly string[] };
type State = {
  readonly models: Map<Type, Model>;
  readonly providers: Map<Type, Provider>;
  readonly definitions: Map<Type, GraphqlModelDefinition>;
  readonly fields: ModelAnalysis['fields'];
  readonly bindings: ModelAnalysis['bindings'];
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
function fail(site: Site, message: string): never {
  throw new Error(`${site.input.resolver}.${site.methodName}: ${message}`);
}

const operationKind = (value: unknown): OperationKind | undefined =>
  OPERATION_KINDS.find((kind) => kind === value);

const methodNameOf = (input: ModelResolverInput, method: Method): string => {
  const { name } = method;
  return input.ts.isStringLiteral(name) || input.ts.isNumericLiteral(name)
    ? name.text
    : name.getText();
};

const siteOf = (input: ModelResolverInput, method: Method): Site | undefined => {
  const methodName = methodNameOf(input, method);
  const props = input.metadata.methods.find((item) => item.name === methodName)?.props ?? [];
  for (const prop of props) {
    const kind = operationKind(Reflect.get(prop, 'kind'));
    if (!kind) continue;
    const fieldName: unknown = Reflect.get(prop, 'fieldName');
    return {
      input,
      reader: { checker: input.checker, ts: input.ts },
      method,
      methodName,
      kind,
      fieldName: typeof fieldName === 'string' ? fieldName : methodName,
    };
  }
  return undefined;
};

const sitesOf = (input: ModelResolverInput): readonly Site[] =>
  input.classNode.members
    .filter(input.ts.isMethodDeclaration)
    .flatMap((method) => siteOf(input, method) ?? []);

const typeText = (site: Site, type: Type): string => site.input.checker.typeToString(type);

const parameterType = (site: Site): Type | undefined => {
  const parameter = site.method.parameters[0];
  return parameter && site.input.checker.getTypeAtLocation(parameter);
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const returnType = (site: Site): Type => {
  const signature = site.input.checker.getSignatureFromDeclaration(site.method);
  if (!signature) fail(site, 'cannot read the method signature');
  return awaited(site.input.checker.getReturnTypeOfSignature(signature), site.reader);
};

const parentRef = (site: Site): ModelRef | undefined => {
  const type = parameterType(site);
  return type && modelRef(arrayElement(type, site.reader) ?? type);
};

/**
 * A class follows the model contract as soon as one of its operations involves a model.
 *
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const touchesModel = (site: Site): boolean => {
  if (site.kind === 'relation' || site.kind === 'resolveMultiField') return true;
  if (site.kind === 'resolveField') return Boolean(parentRef(site));
  if (site.kind === 'query')
    return Boolean(modelRef(referenceType(returnType(site), site.reader).target));
  return false;
};

const isPublicName = (name: string): boolean =>
  !name.startsWith('__') && /^[_A-Za-z][_0-9A-Za-z]*$/.test(name);

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const validateExtraParameters = (site: Site, from: number): void => {
  for (const parameter of site.method.parameters.slice(from)) {
    if (!parameter.initializer && !parameter.questionToken)
      fail(
        site,
        site.kind === 'query'
          ? 'query parameters require defaults; use args(schema) for GraphQL arguments'
          : 'additional parameters require defaults',
      );
  }
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const parentOf = (site: Site): Parent => {
  if (extractGraphqlArgsRef(site.method, site.input.classNode.getSourceFile(), site.input.ts))
    fail(site, 'args() is not supported on model field methods');
  validateExtraParameters(site, 1);
  const type = parameterType(site);
  if (!type) fail(site, 'a parent Pick<Model, keys> parameter is required');
  const element = arrayElement(type, site.reader);
  const ref = modelRef(element ?? type);
  if (!ref)
    fail(
      site,
      `parent must be Pick<Model, keys> or a readonly array of it, written directly; got ${typeText(site, type)}`,
    );
  if (element && !ref.keys.includes('id')) fail(site, 'batch parent Pick requires id');
  return { ref, batch: Boolean(element) };
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const referenceOf = (site: Site, type: Type): ReferenceType => {
  const reference = referenceType(type, site.reader);
  const ref = modelRef(reference.target);
  if (ref?.keys.length !== 1 || ref.keys[0] !== 'id')
    fail(
      site,
      `must return Pick<Model, 'id'>, an array of it, or a nullable form; got ${typeText(site, type)}`,
    );
  return { target: ref.model, shape: reference.shape };
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const modelOf = (state: State, site: Site, type: Type): Model => {
  const existing = state.models.get(type);
  if (existing) return existing;
  const name = modelName(type, site.reader);
  if (!name) fail(site, `model must be a named object type; got ${typeText(site, type)}`);
  if (!isPublicName(name)) fail(site, `invalid GraphQL model name ${name}`);
  if ([...state.models.values()].some((model) => model.name === name))
    fail(site, `another model type is already named ${name}`);
  const declared = new Map(
    site.input.checker.getPropertiesOfType(type).map((symbol) => [symbol.name, symbol]),
  );
  const model = { name, type, origin: site, declared };
  state.models.set(type, model);
  return model;
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const idTypeOf = (site: Site, model: Model): Type => {
  const id = model.declared.get('id');
  if (!id || id.flags & site.input.ts.SymbolFlags.Optional)
    fail(site, `model ${model.name} requires a non-null scalar id`);
  return site.input.checker.getTypeOfSymbol(id);
};

/**
 * Unwraps a batch method's Map so single and batch methods are checked per parent.
 *
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const perParentResult = (site: Site, parent: Parent, model: Model): Type => {
  const returned = returnType(site);
  if (!parent.batch) return returned;
  const entry = mapEntry(returned, site.reader);
  if (!entry) fail(site, 'batch methods must return a Map or ReadonlyMap keyed by parent id');
  const [key, value] = entry;
  const { checker } = site.input;
  const id = idTypeOf(site, model);
  if (!checker.isTypeAssignableTo(key, id) || !checker.isTypeAssignableTo(id, key))
    fail(site, 'Map key must match model id type');
  if (isPromiseLike(value, site.reader)) fail(site, 'batch Map values cannot be Promise');
  return value;
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const providedKeys = (site: Site, parent: Parent, model: Model): readonly string[] => {
  const split = withoutNullish(perParentResult(site, parent, model), site.reader);
  const message = 'provider result must be Model | null or Pick<Model, keys> | null';
  if (!split.nullable) fail(site, message);
  if (split.type === model.type) return [...model.declared.keys()];
  const ref = modelRef(split.type);
  if (ref?.model !== model.type) fail(site, message);
  if (!ref.keys.includes('id')) fail(site, 'provider Pick must include id');
  return ref.keys;
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const registerProvider = (state: State, site: Site): void => {
  const parent = parentOf(site);
  if (parent.ref.keys.length !== 1 || parent.ref.keys[0] !== 'id')
    fail(site, "provider input must be Pick<Model, 'id'> or its array");
  const model = modelOf(state, site, parent.ref.model);
  if (state.providers.has(model.type)) fail(site, `duplicate provider for model ${model.name}`);
  state.providers.set(model.type, {
    site,
    batch: parent.batch,
    keys: providedKeys(site, parent, model),
  });
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const registerModelReferences = (state: State, site: Site): void => {
  if (site.kind === 'mutation') fail(site, 'model resolvers cannot declare mutations');
  if (site.kind === 'resolveMultiField') {
    registerProvider(state, site);
    return;
  }
  if (site.kind === 'query') {
    modelOf(state, site, referenceOf(site, returnType(site)).target);
    return;
  }
  const parent = parentOf(site);
  const model = modelOf(state, site, parent.ref.model);
  if (site.kind === 'relation')
    modelOf(state, site, referenceOf(site, perParentResult(site, parent, model)).target);
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const inspectProperty = (site: Site, model: Model, name: string): GraphqlModelProperty => {
  const symbol = model.declared.get(name);
  if (!symbol) fail(site, `${model.name} has no property ${name}`);
  const optional = Boolean(symbol.flags & site.input.ts.SymbolFlags.Optional);
  const value = modelValue(site.input.checker.getTypeOfSymbol(symbol), site.reader);
  if (!name.startsWith('$')) {
    if (!isPublicName(name)) fail(site, `invalid public property ${name}`);
    if (!isPublicValue(value)) fail(site, `unsupported public property ${model.name}.${name}`);
  }
  return { name, optional, value };
};

const isScalarId = (property: GraphqlModelProperty): boolean =>
  property.name === 'id' &&
  !property.optional &&
  property.value.kind === 'scalar' &&
  (property.value.name === 'ID' || property.value.name === 'string');

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const supply = (site: Site, model: Model, keys: readonly string[]): GraphqlModelProperty[] => {
  const properties = keys.map((key) => inspectProperty(site, model, key));
  if (!properties.some(isScalarId)) fail(site, `model ${model.name} requires a non-null scalar id`);
  return properties;
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const defineModel = (state: State, model: Model): GraphqlModelDefinition => {
  const provider = state.providers.get(model.type);
  if (!provider) return { kind: 'identity', properties: supply(model.origin, model, ['id']) };
  return {
    kind: 'provided',
    provider: { resolver: provider.site.input.resolver, method: provider.site.methodName },
    mode: provider.batch ? 'batch' : 'single',
    properties: supply(provider.site, model, provider.keys),
  };
};

const suppliedProperties = (state: State, model: Model): readonly GraphqlModelProperty[] =>
  state.definitions.get(model.type)?.properties ?? [];

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const registerField = (state: State, site: Site, owner: string, field: GraphqlModelField): void => {
  const fields = readOwnEntry(state.fields, owner) ?? {};
  const bindings = readOwnEntry(state.bindings, owner) ?? {};
  if (readOwnEntry(fields, site.fieldName) !== undefined)
    fail(site, `duplicate field ${owner}.${site.fieldName}`);
  const define = (target: object, key: string, value: unknown): void => {
    Object.defineProperty(target, key, { value, enumerable: true, configurable: true });
  };
  define(fields, site.fieldName, field);
  define(bindings, site.fieldName, { resolver: site.input.resolver, method: site.methodName });
  define(state.fields, owner, fields);
  define(state.bindings, owner, bindings);
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const registerQuery = (state: State, site: Site): void => {
  if (!isPublicName(site.fieldName)) fail(site, 'invalid GraphQL field name');
  validateExtraParameters(site, 0);
  const reference = referenceOf(site, returnType(site));
  const target = modelOf(state, site, reference.target);
  registerField(state, site, 'Query', {
    kind: 'query',
    target: target.name,
    shape: reference.shape,
  });
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const declaredField = (state: State, site: Site, model: Model): Symbol => {
  if (!isPublicName(site.fieldName)) fail(site, 'invalid GraphQL field name');
  const symbol = model.declared.get(site.fieldName);
  if (!symbol)
    fail(site, `field ${model.name}.${site.fieldName} must be declared in ${model.name}`);
  if (suppliedProperties(state, model).some((property) => property.name === site.fieldName))
    fail(site, `duplicate field ${model.name}.${site.fieldName}: the provider already supplies it`);
  return symbol;
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const dependencies = (state: State, site: Site, parent: Parent, model: Model): string[] => {
  const supplied = suppliedProperties(state, model);
  for (const key of parent.ref.keys) {
    if (!supplied.some((property) => property.name === key))
      fail(site, `unknown source dependency ${key}: ${model.name} does not supply it`);
  }
  return [...parent.ref.keys];
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const computedValue = (
  site: Site,
  model: Model,
  symbol: Symbol,
  result: Type,
): GraphqlModelValue => {
  const { checker } = site.input;
  const declared = checker.getTypeOfSymbol(symbol);
  if (!isPublicValue(modelValue(declared, site.reader)))
    fail(
      site,
      `${model.name}.${symbol.name} is not a scalar field; resolve model references with @Relation`,
    );
  const property = inspectProperty(site, model, symbol.name);
  if (!checker.isTypeAssignableTo(result, declared))
    fail(
      site,
      `returns ${typeText(site, result)}, which is not assignable to ${model.name}.${symbol.name}: ${typeText(site, declared)}`,
    );
  return property.optional && property.value.kind !== 'optional'
    ? { kind: 'optional', inner: property.value }
    : property.value;
};

const fitsShape = (actual: GraphqlModelResultShape, declared: GraphqlModelResultShape): boolean => {
  if (actual.nullable && !declared.nullable) return false;
  if (actual.kind === 'one' || declared.kind === 'one') return actual.kind === declared.kind;
  return !actual.itemNullable || declared.itemNullable;
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const relationTarget = (
  state: State,
  site: Site,
  model: Model,
  symbol: Symbol,
  result: Type,
): { readonly target: Model; readonly shape: GraphqlModelResultShape } => {
  const declaredType = site.input.checker.getTypeOfSymbol(symbol);
  const declared = referenceType(declaredType, site.reader);
  const optional = Boolean(symbol.flags & site.input.ts.SymbolFlags.Optional);
  const shape = optional ? { ...declared.shape, nullable: true } : declared.shape;
  const actual = referenceOf(site, result);
  const target = modelOf(state, site, actual.target);
  const field = `${model.name}.${symbol.name}: ${typeText(site, declaredType)}`;
  if (declared.target !== actual.target)
    fail(site, `returns a ${target.name} reference, but ${field} is not a ${target.name} relation`);
  if (!fitsShape(actual.shape, shape))
    fail(site, `the returned nullability or list shape does not fit ${field}`);
  return { target, shape };
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const registerModelField = (state: State, site: Site): void => {
  const parent = parentOf(site);
  const model = modelOf(state, site, parent.ref.model);
  const symbol = declaredField(state, site, model);
  const dependencyKeys = dependencies(state, site, parent, model);
  const mode = parent.batch ? 'batch' : 'single';
  const result = perParentResult(site, parent, model);
  if (site.kind === 'relation') {
    const { target, shape } = relationTarget(state, site, model, symbol, result);
    registerField(state, site, model.name, {
      kind: 'relation',
      target: target.name,
      shape,
      dependencies: dependencyKeys,
      mode,
    });
    return;
  }
  const value = computedValue(site, model, symbol, result);
  registerField(state, site, model.name, {
    kind: 'computed',
    dependencies: dependencyKeys,
    mode,
    value,
  });
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const assertComplete = (state: State, model: Model): void => {
  const supplied = suppliedProperties(state, model);
  for (const name of model.declared.keys()) {
    const resolved =
      supplied.some((property) => property.name === name) ||
      readOwnEntry(state.fields[model.name] ?? {}, name) !== undefined;
    if (!resolved)
      fail(
        model.origin,
        `${model.name}.${name} has no resolver; supply it from @ResolveMultiField or resolve it with @ResolveField / @Relation`,
      );
  }
};

/** @throws {Error} from graphql-model-analysis.lib.ts:fail */
const resolveModelFields = (state: State, sites: readonly Site[]): void => {
  for (const site of sites) {
    if (site.kind === 'query') registerQuery(state, site);
    else if (site.kind === 'resolveField' || site.kind === 'relation')
      registerModelField(state, site);
  }
};

/**
 * Validates model resolvers against the model types they reference and produces the single
 * representation that both SDL rendering and the runtime manifest consume.
 *
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
export const analyzeGraphqlModels = (inputs: readonly ModelResolverInput[]): ModelAnalysis => {
  const modelInputs = inputs.filter((input) => sitesOf(input).some(touchesModel));
  const sites = modelInputs.flatMap(sitesOf);
  const state: State = {
    models: new Map(),
    providers: new Map(),
    definitions: new Map(),
    fields: {},
    bindings: {},
  };
  for (const site of sites) registerModelReferences(state, site);
  const definitions = [...state.models.values()].map(
    (model) => [model, defineModel(state, model)] as const,
  );
  for (const [model, definition] of definitions) state.definitions.set(model.type, definition);
  resolveModelFields(state, sites);
  for (const model of state.models.values()) assertComplete(state, model);
  return {
    models: Object.fromEntries(definitions.map(([model, definition]) => [model.name, definition])),
    fields: state.fields,
    bindings: state.bindings,
    modelResolvers: new Set(modelInputs.map((input) => input.resolver)),
  };
};
