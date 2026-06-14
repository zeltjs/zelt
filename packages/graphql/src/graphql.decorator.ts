import { Injectable } from '@zeltjs/core';
import type { ClassDecoratorFn, MethodDecoratorFn } from '@zeltjs/decorator-metadata';
import { createClassDecorator, createMethodDecorator } from '@zeltjs/decorator-metadata';

import type {
  GraphqlOperationKind,
  GraphqlOperationMetadata,
  GraphqlResolverClass,
} from './graphql-metadata.lib';
import { setResolverMetadata } from './graphql-metadata.lib';

// Decorated classes always construct objects; the afterApply hook only
// widens the instance type to unknown, so this narrowing is safe.
function narrowToResolverClass(cls: new (...args: never[]) => unknown): GraphqlResolverClass;
function narrowToResolverClass(cls: new (...args: never[]) => unknown): unknown {
  return cls;
}

/** @throws {E} */
export const Resolver = (): ClassDecoratorFn =>
  createClassDecorator({ kind: 'resolver' } as const, {
    afterApply: (cls) => {
      setResolverMetadata(narrowToResolverClass(cls), { kind: 'resolver' });
      Injectable()(cls);
    },
  });

/** @throws {E} */
const createGraphqlOperationDecorator =
  (kind: GraphqlOperationKind) =>
  (fieldName?: string): MethodDecoratorFn =>
    createMethodDecorator<GraphqlOperationMetadata>({
      kind,
      ...(fieldName !== undefined ? { fieldName } : {}),
    });

export const Query = createGraphqlOperationDecorator('query');
export const Mutation = createGraphqlOperationDecorator('mutation');
export const ResolveField = createGraphqlOperationDecorator('resolveField');
