import { match } from 'ts-pattern';
import type { GraphqlModelResultShape, GraphqlModelValue } from './graphql-model.types';
import type { ModelTypeReader } from './graphql-model-checker.lib';
import { awaited, typeText } from './graphql-model-checker.lib';
import type { ModelDeclaration } from './graphql-model-declaration.lib';
import {
  isPublicName,
  readModelDeclaration,
  readModelProperty,
} from './graphql-model-declaration.lib';
import type { ModelMethod } from './graphql-model-method.lib';
import type { Parent } from './graphql-model-parent.lib';
import { hasOnlyOptionalParameters, readParent } from './graphql-model-parent.lib';
import { readPerParent } from './graphql-model-per-parent.lib';
import type { Read, Result } from './graphql-model-read.lib';
import { absent, andThen, ok, rejected } from './graphql-model-read.lib';
import type { Reference } from './graphql-model-reference.lib';
import { fitsShape, readReference, readShape } from './graphql-model-reference.lib';
import { readSupply } from './graphql-model-supply.lib';
import { isPublicValue, readModelValue } from './graphql-model-value.lib';

type Type = import('typescript').Type;
type Symbol = import('typescript').Symbol;

/** What each decorator means once its signature is read against the model types. */
export type ModelOperation =
  | { kind: 'query'; readonly method: ModelMethod; readonly reference: Reference }
  | {
      kind: 'provider';
      readonly method: ModelMethod;
      readonly parent: Parent;
      readonly supplies: readonly string[];
    }
  | {
      kind: 'computed';
      readonly method: ModelMethod;
      readonly parent: Parent;
      readonly value: GraphqlModelValue;
    }
  | {
      kind: 'relation';
      readonly method: ModelMethod;
      readonly parent: Parent;
      readonly target: Type;
      readonly shape: GraphqlModelResultShape;
    };

const returnType = (method: ModelMethod, reader: ModelTypeReader): Result<Type> => {
  const signature = reader.checker.getSignatureFromDeclaration(method.declaration);
  if (!signature) return rejected('cannot read the method signature');
  return ok(awaited(reader.checker.getReturnTypeOfSignature(signature), reader));
};

const parameterText = (method: ModelMethod, reader: ModelTypeReader): string => {
  const [parameter] = method.declaration.parameters;
  return parameter ? typeText(reader.checker.getTypeAtLocation(parameter), reader) : 'nothing';
};

/** Why a method of a model resolver is not one of the model operations. */
export const notAModelOperation = (method: ModelMethod, reader: ModelTypeReader): string =>
  match(method.kind)
    .with('mutation', () => 'model resolvers cannot declare mutations')
    .with('query', () => {
      const returned = returnType(method, reader);
      const got = returned.kind === 'ok' ? typeText(returned.value, reader) : 'unknown';
      return `must return Pick<Model, 'id'>, an array of it, or a nullable form; got ${got}`;
    })
    .otherwise(
      () =>
        `parent must be Pick<Model, keys> or a readonly array of it; got ${parameterText(method, reader)}`,
    );

/** `@Query`: selects model ids and returns them as a reference. */
const readQuery = (method: ModelMethod, reader: ModelTypeReader): Read<ModelOperation> => {
  const returned = returnType(method, reader);
  if (returned.kind !== 'ok') return returned;
  const reference = readReference(returned.value, reader);
  if (reference.kind !== 'ok') return reference;
  if (!isPublicName(method.fieldName)) return rejected('invalid GraphQL field name');
  if (!hasOnlyOptionalParameters(method.declaration, 0))
    return rejected('query parameters require defaults; use args(schema) for GraphQL arguments');
  return ok({ kind: 'query', method, reference: reference.value });
};

const requiredParent = (method: ModelMethod, reader: ModelTypeReader): Result<Parent> => {
  const parent = readParent(method.declaration, reader);
  return parent.kind === 'absent' ? rejected(notAModelOperation(method, reader)) : parent;
};

const perParentResult = (
  method: ModelMethod,
  parent: Parent,
  reader: ModelTypeReader,
): Result<Type> =>
  andThen(returnType(method, reader), (returned) => readPerParent(returned, parent, reader));

/**
 * `@ResolveMultiField`: supplies properties of the models whose ids it receives.
 */
const readProvider = (method: ModelMethod, reader: ModelTypeReader): Result<ModelOperation> =>
  andThen(requiredParent(method, reader), (parent) => {
    const { keys, model } = parent.ref;
    if (keys.length !== 1 || keys[0] !== 'id')
      return rejected("provider input must be Pick<Model, 'id'> or its array");
    return andThen(perParentResult(method, parent, reader), (value) =>
      andThen(readSupply(value, model, reader), (supplies) =>
        ok({ kind: 'provider', method, parent, supplies }),
      ),
    );
  });

type Field = { readonly model: ModelDeclaration; readonly symbol: Symbol; readonly text: string };

/** Field methods resolve a property the model type declares, under the property's name. */
const declaredField = (
  method: ModelMethod,
  parent: Parent,
  reader: ModelTypeReader,
): Result<Field> => {
  if (!isPublicName(method.fieldName)) return rejected('invalid GraphQL field name');
  return andThen(readModelDeclaration(parent.ref.model, reader), (model) => {
    const symbol = model.properties.get(method.fieldName);
    if (!symbol)
      return rejected(`field ${model.name}.${method.fieldName} must be declared in ${model.name}`);
    const declared = typeText(reader.checker.getTypeOfSymbol(symbol), reader);
    return ok({ model, symbol, text: `${model.name}.${symbol.name}: ${declared}` });
  });
};

/** A computed field returns a value assignable to the property it resolves. */
const computedValue = (
  field: Field,
  result: Type,
  reader: ModelTypeReader,
): Result<GraphqlModelValue> => {
  const declared = reader.checker.getTypeOfSymbol(field.symbol);
  const name = `${field.model.name}.${field.symbol.name}`;
  if (!isPublicValue(readModelValue(declared, reader)))
    return rejected(`${name} is not a scalar field; resolve model references with @Relation`);
  if (!reader.checker.isTypeAssignableTo(result, declared))
    return rejected(
      `returns ${typeText(result, reader)}, which is not assignable to ${name}: ${typeText(declared, reader)}`,
    );
  return andThen(readModelProperty(field.model, field.symbol.name, reader), (property) =>
    ok(
      property.optional && property.value.kind !== 'optional'
        ? { kind: 'optional', inner: property.value }
        : property.value,
    ),
  );
};

/**
 * `@ResolveField`: computes one declared property from the parent's properties.
 */
const readComputed = (method: ModelMethod, reader: ModelTypeReader): Read<ModelOperation> => {
  const parent = readParent(method.declaration, reader);
  if (parent.kind !== 'ok') return parent;
  return andThen(declaredField(method, parent.value, reader), (field) =>
    andThen(perParentResult(method, parent.value, reader), (result) =>
      andThen(computedValue(field, result, reader), (value) =>
        ok({ kind: 'computed', method, parent: parent.value, value }),
      ),
    ),
  );
};

/** A relation returns a reference to the model and shape the property declares. */
const relationShape = (
  field: Field,
  result: Type,
  reader: ModelTypeReader,
): Result<{ readonly target: Type; readonly shape: GraphqlModelResultShape }> => {
  const reference = readReference(result, reader);
  if (reference.kind === 'absent')
    return rejected(
      `must return Pick<Model, 'id'>, an array of it, or a nullable form; got ${typeText(result, reader)}`,
    );
  if (reference.kind === 'rejected') return reference;
  const declared = readShape(reader.checker.getTypeOfSymbol(field.symbol), reader);
  const optional = Boolean(field.symbol.flags & reader.ts.SymbolFlags.Optional);
  const shape = optional ? { ...declared.shape, nullable: true } : declared.shape;
  const { model, shape: actual } = reference.value;
  return andThen(readModelDeclaration(model, reader), (target) => {
    if (declared.target !== model)
      return rejected(
        `returns a ${target.name} reference, but ${field.text} is not a ${target.name} relation`,
      );
    if (!fitsShape(actual, shape))
      return rejected(`the returned nullability or list shape does not fit ${field.text}`);
    return ok({ target: model, shape });
  });
};

/**
 * `@Relation`: selects the ids of related models from the parent's properties.
 */
const readRelation = (method: ModelMethod, reader: ModelTypeReader): Result<ModelOperation> =>
  andThen(requiredParent(method, reader), (parent) =>
    andThen(declaredField(method, parent, reader), (field) =>
      andThen(perParentResult(method, parent, reader), (result) =>
        andThen(relationShape(field, result, reader), ({ target, shape }) =>
          ok({ kind: 'relation', method, parent, target, shape }),
        ),
      ),
    ),
  );

/**
 * Absent when the method does not involve a model, which leaves it to the generic pipeline.
 */
export const readModelOperation = (
  method: ModelMethod,
  reader: ModelTypeReader,
): Read<ModelOperation> =>
  match(method.kind)
    .with('mutation', () => absent)
    .with('query', () => readQuery(method, reader))
    .with('resolveField', () => readComputed(method, reader))
    .with('resolveMultiField', () => readProvider(method, reader))
    .with('relation', () => readRelation(method, reader))
    .exhaustive();
