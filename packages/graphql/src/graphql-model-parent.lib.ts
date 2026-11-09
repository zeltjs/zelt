import { hasGraphqlArgsCall } from './analyze-gql-args.lib';
import type { ModelTypeReader } from './graphql-model-checker.lib';
import { arrayElement } from './graphql-model-checker.lib';
import type { PickRef } from './graphql-model-pick.lib';
import { readPick } from './graphql-model-pick.lib';
import type { Read } from './graphql-model-read.lib';
import { absent, ok, rejected } from './graphql-model-read.lib';

type Method = import('typescript').MethodDeclaration;

/** The parent a field method receives: `Pick<Model, keys>`, or a readonly array of it in batch. */
export type Parent = { readonly ref: PickRef; readonly batch: boolean };

/** Parameters after the first are not GraphQL inputs, so they must be omittable. */
export const hasOnlyOptionalParameters = (method: Method, from: number): boolean =>
  method.parameters
    .slice(from)
    .every((parameter) => parameter.initializer !== undefined || parameter.questionToken);

// The parent is the only input of a field method; GraphQL arguments are not part of the contract.
const parameterProblem = (method: Method, reader: ModelTypeReader): string | undefined => {
  if (hasGraphqlArgsCall(method, method.getSourceFile(), reader.ts))
    return 'args() is not supported on model field methods';
  return hasOnlyOptionalParameters(method, 1)
    ? undefined
    : 'additional parameters require defaults';
};

export const readParent = (method: Method, reader: ModelTypeReader): Read<Parent> => {
  const [parameter] = method.parameters;
  if (!parameter) return absent;
  const type = reader.checker.getTypeAtLocation(parameter);
  const element = arrayElement(type, reader);
  const pick = readPick(element ?? type, reader);
  if (pick.kind !== 'ok') return pick;
  const problem = parameterProblem(method, reader);
  if (problem) return rejected(problem);
  if (element && !pick.value.keys.includes('id')) return rejected('batch parent Pick requires id');
  return ok({ ref: pick.value, batch: element !== undefined });
};
