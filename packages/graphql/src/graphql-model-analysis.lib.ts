import type { ClassMetadata } from '@zeltjs/decorator-metadata/inspect';
import { extractGraphqlArgsRef } from './analyze-gql-args.lib';
import type {
  GraphqlModelDefinition,
  GraphqlModelField,
  GraphqlModelProperty,
  GraphqlModelResultShape,
  GraphqlModelValue,
} from './graphql-model.types';
import { readOwnEntry } from './graphql-record.lib';

type TS = typeof import('typescript');
type TypeNode = import('typescript').TypeNode;
type Symbol = import('typescript').Symbol;
type Checker = import('typescript').TypeChecker;
type Method = import('typescript').MethodDeclaration;

export type ModelResolverInput = {
  readonly resolver: string;
  readonly metadata: ClassMetadata;
  readonly classNode: import('typescript').ClassDeclaration;
  readonly checker: Checker;
  readonly ts: TS;
};
type Model = {
  readonly name: string;
  readonly symbol: Symbol;
  readonly input: ModelResolverInput;
  readonly definition: GraphqlModelDefinition;
};
export type ModelAnalysis = {
  readonly models: Record<string, GraphqlModelDefinition>;
  readonly fields: Record<string, Record<string, GraphqlModelField>>;
  readonly modelResolvers: ReadonlySet<string>;
  readonly bindings: Record<string, Record<string, { resolver: string; method: string }>>;
};

const operation = (
  input: ModelResolverInput,
  name: string,
): { kind: string; fieldName: string } | undefined => {
  const method = input.metadata.methods.find((item) => item.name === name);
  for (const prop of method?.props ?? []) {
    const kind: unknown = Reflect.get(prop, 'kind');
    if (
      typeof kind === 'string' &&
      ['query', 'mutation', 'resolveField', 'relation', 'resolveMultiField'].includes(kind)
    ) {
      const fieldName: unknown = Reflect.get(prop, 'fieldName');
      return { kind, fieldName: typeof fieldName === 'string' ? fieldName : name };
    }
  }
  return undefined;
};
const methods = (input: ModelResolverInput): readonly Method[] =>
  input.classNode.members.filter(input.ts.isMethodDeclaration);
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
function fail(input: ModelResolverInput, method: Method, message: string): never {
  throw new Error(`${input.resolver}.${method.name.getText()}: ${message}`);
}
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:required
 */
const required = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('Missing required TypeScript declaration');
  return value;
};
const isBuiltin = (node: TypeNode, name: string, input: ModelResolverInput): boolean => {
  const symbol = symbolFor(node, input.checker, input.ts);
  return (
    symbol?.name === name &&
    Boolean(
      symbol.declarations?.some((d) =>
        /[\\/]typescript[\\/]lib[\\/]lib\..*\.d\.ts$/.test(d.getSourceFile().fileName),
      ),
    )
  );
};
const unwrapPromise = (node: TypeNode, input: ModelResolverInput): TypeNode => {
  if (input.ts.isTypeReferenceNode(node) && isBuiltin(node, 'Promise', input)) {
    const inner = node.typeArguments?.[0];
    if (inner && node.typeArguments.length === 1) return unwrapPromise(inner, input);
  }
  return node;
};
const isBuiltinArray = (node: TypeNode, input: ModelResolverInput): boolean =>
  isBuiltin(node, 'Array', input) || isBuiltin(node, 'ReadonlyArray', input);
const arrayElement = (node: TypeNode, input: ModelResolverInput): TypeNode | undefined => {
  const { ts } = input;
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword)
    return arrayElement(node.type, input);
  if (ts.isArrayTypeNode(node)) return node.elementType;
  if (ts.isTypeReferenceNode(node) && isBuiltinArray(node, input)) return node.typeArguments?.[0];
  return undefined;
};
const symbolFor = (node: TypeNode, checker: Checker, ts: TS): Symbol | undefined => {
  if (!ts.isTypeReferenceNode(node)) return undefined;
  const symbol = checker.getSymbolAtLocation(node.typeName);
  return symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const pickKeys = (node: TypeNode, input: ModelResolverInput, method: Method): string[] => {
  const nodes = input.ts.isUnionTypeNode(node) ? node.types : [node];
  return nodes.map((key) => {
    if (!input.ts.isLiteralTypeNode(key) || !input.ts.isStringLiteral(key.literal))
      fail(input, method, 'Pick keys must be string literals');
    return key.literal.text;
  });
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const requireModelSymbol = (node: TypeNode, input: ModelResolverInput, method: Method): Symbol => {
  const symbol = symbolFor(node, input.checker, input.ts);
  return symbol ?? fail(input, method, 'expected a named model type');
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const pick = (
  node: TypeNode | undefined,
  input: ModelResolverInput,
  method: Method,
): { symbol: Symbol; keys: string[] } => {
  const { ts } = input;
  if (!node || !ts.isTypeReferenceNode(node))
    fail(input, method, 'expected a direct Pick<Model, keys>');
  if (node.typeName.getText() !== 'Pick')
    fail(input, method, 'expected a direct Pick<Model, keys>');
  if (node.typeArguments?.length !== 2) fail(input, method, 'expected a direct Pick<Model, keys>');
  if (!isBuiltin(node, 'Pick', input)) fail(input, method, 'expected the built-in Pick type');
  const symbol = requireModelSymbol(required(node.typeArguments[0]), input, method);
  return { symbol, keys: pickKeys(required(node.typeArguments[1]), input, method) };
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:required
 */
const unionModelValue = (
  type: import('typescript').UnionType,
  checker: Checker,
  ts: TS,
): GraphqlModelValue => {
  const values = type.types.filter(
    (item) => !(item.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)),
  );
  const boolean =
    values.length > 0 && values.every((item) => Boolean(item.flags & ts.TypeFlags.BooleanLike));
  let result: GraphqlModelValue = boolean
    ? { kind: 'scalar', name: 'boolean' }
    : values.length === 1
      ? modelValueOf(required(values[0]), checker, ts)
      : { kind: 'opaque' };
  if (type.types.some((item) => Boolean(item.flags & ts.TypeFlags.Null)))
    result = { kind: 'nullable', inner: result };
  if (type.types.some((item) => Boolean(item.flags & ts.TypeFlags.Undefined)))
    result = { kind: 'optional', inner: result };
  return result;
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:required
 */
const modelValueOf = (
  type: import('typescript').Type,
  checker: Checker,
  ts: TS,
): GraphqlModelValue => {
  if (type.flags & ts.TypeFlags.BooleanLike) return { kind: 'scalar', name: 'boolean' };
  if (type.isUnion()) return unionModelValue(type, checker, ts);
  if (type.flags & ts.TypeFlags.StringLike) return { kind: 'scalar', name: 'string' };
  if (type.flags & ts.TypeFlags.NumberLike) return { kind: 'scalar', name: 'number' };
  if (checker.isArrayType(type)) {
    const item = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
    return item ? { kind: 'array', item: modelValueOf(item, checker, ts) } : { kind: 'opaque' };
  }
  return { kind: 'opaque' };
};
const publicValue = (value: GraphqlModelValue): boolean =>
  value.kind === 'scalar' ||
  ((value.kind === 'nullable' || value.kind === 'optional') && publicValue(value.inner)) ||
  (value.kind === 'array' && publicValue(value.item));
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:required
 */
const nullable = (node: TypeNode, ts: TS): { node: TypeNode; nullable: boolean } => {
  if (ts.isParenthesizedTypeNode(node)) return nullable(node.type, ts);
  if (!ts.isUnionTypeNode(node)) return { node, nullable: false };
  const rest = node.types.filter(
    (n) => !(ts.isLiteralTypeNode(n) && n.literal.kind === ts.SyntaxKind.NullKeyword),
  );
  return rest.length === 1 && rest.length !== node.types.length
    ? { node: required(rest[0]), nullable: true }
    : { node, nullable: false };
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const result = (
  node: TypeNode,
  input: ModelResolverInput,
  method: Method,
): { symbol: Symbol; shape: GraphqlModelResultShape } => {
  const outer = nullable(unwrapPromise(node, input), input.ts);
  const element = arrayElement(outer.node, input);
  const inner = nullable(element ?? outer.node, input.ts);
  const ref = pick(inner.node, input, method);
  if (ref.keys.length !== 1 || ref.keys[0] !== 'id')
    fail(input, method, "reference must be Pick<Model, 'id'>");
  return {
    symbol: ref.symbol,
    shape: element
      ? { kind: 'many', nullable: outer.nullable, itemNullable: inner.nullable }
      : { kind: 'one', nullable: outer.nullable },
  };
};

/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const validateParentParameters = (input: ModelResolverInput, method: Method): void => {
  if (extractGraphqlArgsRef(method, input.classNode.getSourceFile(), input.ts))
    fail(input, method, 'args() is not supported on model field methods');
  for (const parameter of method.parameters.slice(1)) {
    if (!parameter.initializer) fail(input, method, 'additional parameters require defaults');
  }
};

const isPublicName = (name: string): boolean =>
  !name.startsWith('__') && /^[_A-Za-z][_0-9A-Za-z]*$/.test(name);
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const validatePublicProperty = (
  name: string,
  value: GraphqlModelValue,
  input: ModelResolverInput,
  method: Method,
): void => {
  if (!isPublicName(name)) fail(input, method, `invalid public property ${name}`);
  if (!publicValue(value)) fail(input, method, `unsupported public property ${name}`);
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const inspectProperty = (
  property: Symbol,
  input: ModelResolverInput,
  method: Method,
): GraphqlModelProperty => {
  const declaration = property.valueDeclaration ?? property.declarations?.[0];
  if (!declaration) fail(input, method, `cannot inspect property ${property.name}`);
  const optional = Boolean(property.flags & input.ts.SymbolFlags.Optional);
  const value = modelValueOf(
    input.checker.getTypeOfSymbolAtLocation(property, declaration),
    input.checker,
    input.ts,
  );
  if (!property.name.startsWith('$')) validatePublicProperty(property.name, value, input, method);
  return { name: property.name, optional, value };
};

/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const assertIdKey = (
  key: TypeNode,
  symbol: Symbol,
  input: ModelResolverInput,
  method: Method,
): void => {
  const id = input.checker.getDeclaredTypeOfSymbol(symbol).getProperty('id');
  if (!id) fail(input, method, 'model requires an id');
  const declaration = id.valueDeclaration ?? id.declarations?.[0];
  if (!declaration) fail(input, method, 'model requires an id');
  const expected = input.checker.getTypeOfSymbolAtLocation(id, declaration);
  const actual = input.checker.getTypeFromTypeNode(key);
  if (
    !input.checker.isTypeAssignableTo(actual, expected) ||
    !input.checker.isTypeAssignableTo(expected, actual)
  )
    fail(input, method, 'Map key must match model id type');
};

const isBuiltinMap = (node: TypeNode, input: ModelResolverInput): boolean =>
  isBuiltin(node, 'Map', input) || isBuiltin(node, 'ReadonlyMap', input);
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const requireMapArguments = (
  args: readonly TypeNode[] | undefined,
  input: ModelResolverInput,
  method: Method,
): readonly [TypeNode, TypeNode] => {
  const [key, value, ...rest] = args ?? [];
  if (!key || !value || rest.length) fail(input, method, 'expected Map<id, value>');
  return [key, value];
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const mapArguments = (
  node: TypeNode | undefined,
  input: ModelResolverInput,
  method: Method,
): readonly [TypeNode, TypeNode] => {
  if (!node || !input.ts.isTypeReferenceNode(node)) fail(input, method, 'expected Map<id, value>');
  if (!isBuiltinMap(node, input))
    fail(input, method, 'provider must return Map or ReadonlyMap from TypeScript');
  return requireMapArguments(node.typeArguments, input, method);
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const providerMethod = (input: ModelResolverInput): Method | undefined => {
  const providers = methods(input).filter(
    (m) => operation(input, m.name.getText())?.kind === 'resolveMultiField',
  );
  const first = providers[0];
  if (first && providers.length !== 1)
    fail(input, first, 'exactly one @ResolveMultiField is required');
  if (first) return first;
  const relation = methods(input).find(
    (m) => operation(input, m.name.getText())?.kind === 'relation',
  );
  if (relation) fail(input, relation, '@Relation requires a model provider');
  return undefined;
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const providerSymbol = (input: ModelResolverInput, method: Method): Symbol => {
  validateParentParameters(input, method);
  const parent = method.parameters[0]?.type;
  const ref = pick(parent && arrayElement(parent, input), input, method);
  if (ref.keys.length !== 1 || ref.keys[0] !== 'id')
    fail(input, method, "provider input must be Pick<Model, 'id'>[]");
  return ref.symbol;
};
const isStringId = (id: GraphqlModelProperty | undefined): boolean =>
  Boolean(id && !id.optional && id.value.kind === 'scalar' && id.value.name === 'string');
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const providerProperties = (
  input: ModelResolverInput,
  method: Method,
  symbol: Symbol,
): GraphqlModelProperty[] => {
  const returned = method.type && unwrapPromise(method.type, input);
  const [key, value] = mapArguments(returned, input, method);
  const data = nullable(value, input.ts);
  if (!data.nullable || symbolFor(data.node, input.checker, input.ts) !== symbol)
    fail(input, method, 'provider Map value must be Model | null');
  assertIdKey(key, symbol, input, method);
  const properties = input.checker
    .getDeclaredTypeOfSymbol(symbol)
    .getProperties()
    .map((property) => inspectProperty(property, input, method));
  const id = properties.find((property) => property.name === 'id');
  if (!isStringId(id)) fail(input, method, 'model requires a non-null scalar id');
  return properties;
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const collectModels = (inputs: readonly ModelResolverInput[]): Model[] => {
  const models: Model[] = [];
  for (const input of inputs) {
    const method = providerMethod(input);
    if (!method) continue;
    const symbol = providerSymbol(input, method);
    if (symbol.name.startsWith('__')) fail(input, method, 'reserved GraphQL model name');
    if (models.some((model) => model.symbol === symbol || model.name === symbol.name))
      fail(input, method, 'duplicate model provider or model name');
    const properties = providerProperties(input, method, symbol);
    models.push({
      name: symbol.name,
      symbol,
      input,
      definition: {
        provider: { resolver: input.resolver, method: method.name.getText() },
        properties,
      },
    });
  }
  return models;
};

type FieldState = {
  readonly models: readonly Model[];
  readonly fields: ModelAnalysis['fields'];
  readonly bindings: ModelAnalysis['bindings'];
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const modelFor = (
  state: FieldState,
  symbol: Symbol,
  input: ModelResolverInput,
  method: Method,
): Model =>
  state.models.find((model) => model.symbol === symbol) ??
  fail(input, method, `no provider for model ${symbol.name}`);
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const registerField = (
  state: FieldState,
  owner: string,
  name: string,
  field: GraphqlModelField,
  input: ModelResolverInput,
  method: Method,
): void => {
  const fields = readOwnEntry(state.fields, owner) ?? {};
  const bindings = readOwnEntry(state.bindings, owner) ?? {};
  if (readOwnEntry(fields, name) !== undefined)
    fail(input, method, `duplicate field ${owner}.${name}`);
  Object.defineProperty(fields, name, { value: field, enumerable: true, configurable: true });
  Object.defineProperty(bindings, name, {
    value: { resolver: input.resolver, method: method.name.getText() },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(state.fields, owner, {
    value: fields,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(state.bindings, owner, {
    value: bindings,
    enumerable: true,
    configurable: true,
  });
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const queryField = (
  state: FieldState,
  model: Model,
  method: Method,
  name: string,
  type: TypeNode,
): void => {
  const target = result(type, model.input, method);
  registerField(
    state,
    'Query',
    name,
    {
      kind: 'query',
      target: modelFor(state, target.symbol, model.input, method).name,
      shape: target.shape,
    },
    model.input,
    method,
  );
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const dependencies = (model: Model, method: Method): { keys: string[]; batch: boolean } => {
  const { input } = model;
  validateParentParameters(input, method);
  const param = method.parameters[0]?.type;
  const batchElement = param && arrayElement(param, input);
  const dep = pick(batchElement ?? param, input, method);
  if (dep.symbol !== model.symbol) fail(input, method, 'parent Pick must refer to provider model');
  for (const key of dep.keys) {
    if (!model.definition.properties.some((property) => property.name === key))
      fail(input, method, `unknown source dependency ${key}`);
  }
  return { keys: dep.keys, batch: Boolean(batchElement) };
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:required
 */
const computedField = (
  model: Model,
  method: Method,
  type: TypeNode,
  dep: ReturnType<typeof dependencies>,
): GraphqlModelField => {
  const { input } = model;
  if (dep.batch || unwrapPromise(type, input) !== type)
    fail(input, method, 'computed fields must be synchronous and accept one parent');
  if (!publicValue(modelValueOf(input.checker.getTypeFromTypeNode(type), input.checker, input.ts)))
    fail(input, method, 'unsupported computed field type');
  return { kind: 'computed', dependencies: dep.keys };
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const relationField = (
  state: FieldState,
  model: Model,
  method: Method,
  type: TypeNode,
  dep: ReturnType<typeof dependencies>,
): GraphqlModelField => {
  const { input } = model;
  let node = unwrapPromise(type, input);
  if (dep.batch) {
    const [key, value] = mapArguments(node, input, method);
    assertIdKey(key, model.symbol, input, method);
    node = value;
  }
  const target = result(node, input, method);
  return {
    kind: 'relation',
    target: modelFor(state, target.symbol, input, method).name,
    shape: target.shape,
    dependencies: dep.keys,
    mode: dep.batch ? 'batch' : 'single',
  };
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const registerModelField = (
  state: FieldState,
  model: Model,
  method: Method,
  names: Set<string>,
  name: string,
  kind: string,
  type: TypeNode,
): void => {
  const { input } = model;
  if (names.has(name)) fail(input, method, `duplicate field ${model.name}.${name}`);
  names.add(name);
  const dep = dependencies(model, method);
  const field =
    kind === 'resolveField'
      ? computedField(model, method, type, dep)
      : relationField(state, model, method, type, dep);
  registerField(state, model.name, name, field, input, method);
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const analyzeField = (
  state: FieldState,
  model: Model,
  method: Method,
  names: Set<string>,
): void => {
  const { input } = model;
  const op = operation(input, method.name.getText());
  if (!op || op.kind === 'resolveMultiField') return;
  if (op.kind === 'mutation') fail(input, method, 'model mutations are not supported');
  if (!isPublicName(op.fieldName)) fail(input, method, 'invalid GraphQL field name');
  if (!method.type) fail(input, method, 'explicit return type is required');
  if (op.kind === 'query') {
    queryField(state, model, method, op.fieldName, method.type);
    return;
  }
  registerModelField(state, model, method, names, op.fieldName, op.kind, method.type);
};
/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
const collectFields = (models: readonly Model[]): Pick<ModelAnalysis, 'fields' | 'bindings'> => {
  const state: FieldState = { models, fields: {}, bindings: {} };
  for (const model of models) {
    const names = new Set(
      model.definition.properties
        .filter((property) => !property.name.startsWith('$'))
        .map((property) => property.name),
    );
    for (const method of methods(model.input)) analyzeField(state, model, method, names);
  }
  return { fields: state.fields, bindings: state.bindings };
};

/**
 * @throws {Error} from graphql-model-analysis.lib.ts:fail
 */
export const analyzeGraphqlModels = (inputs: readonly ModelResolverInput[]): ModelAnalysis => {
  const models = collectModels(inputs);
  const { fields, bindings } = collectFields(models);
  return {
    models: Object.fromEntries(models.map((m) => [m.name, m.definition])),
    fields,
    bindings,
    modelResolvers: new Set(models.map((m) => m.input.resolver)),
  };
};
