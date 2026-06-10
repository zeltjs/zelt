import { Injectable } from '@zeltjs/core';
import type { ClassDecoratorFn, MethodDecoratorFn } from '@zeltjs/decorator-metadata';
import { createClassDecorator, createMethodDecorator } from '@zeltjs/decorator-metadata';

import type {
  GraphqlOperationKind,
  GraphqlOperationMetadata,
  GraphqlResolverClass,
} from './graphql.metadata';
import { setResolverMetadata } from './graphql.metadata';

export const Resolver = (): ClassDecoratorFn =>
  createClassDecorator({ kind: 'resolver' } as const, {
    afterApply: (cls) => {
      setResolverMetadata(cls as GraphqlResolverClass, { kind: 'resolver' });
      Injectable()(cls);
    },
  });

const createGraphqlOperationDecorator = (kind: GraphqlOperationKind) => (): MethodDecoratorFn =>
  createMethodDecorator<GraphqlOperationMetadata>({ kind });

export const Query = createGraphqlOperationDecorator('query');
export const Mutation = createGraphqlOperationDecorator('mutation');
export const ResolveField = createGraphqlOperationDecorator('resolveField');
