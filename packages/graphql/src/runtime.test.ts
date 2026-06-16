import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp, http } from '@zeltjs/core';
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { GraphqlArgsValidationError } from './args.lib';
import type { GeneratedGraphqlRuntime } from './graphql-runtime.lib';
import {
  createGraphqlExecutor,
  executeGraphqlRequest,
  loadGeneratedGraphqlRuntime,
} from './graphql-runtime.lib';
import { args, gqlScalar, graphql, Query, ResolveField, Resolver } from './index';

type ViewerPublic = {
  readonly id: string;
};

@Resolver()
class RuntimeViewerResolver {
  constructor() {
    Reflect.get(globalThis, '__zeltGraphqlRuntimeEvents')?.push('resolver');
  }

  @Query()
  viewer(): ViewerPublic {
    return { id: 'viewer' };
  }

  @ResolveField()
  posts(_parent: ViewerPublic): readonly string[] {
    return ['first'];
  }
}

const runtime = {
  schemaSdl: `type Query {
  viewer: ViewerPublic!
}

type ViewerPublic {
  id: String!
  posts: [String!]!
}
`,
  bindings: {
    Query: {
      viewer: { resolver: 'RuntimeViewerResolver', method: 'viewer' },
    },
    ViewerPublic: {
      posts: { resolver: 'RuntimeViewerResolver', method: 'posts' },
    },
  },
} satisfies GeneratedGraphqlRuntime;

describe('executeGraphqlRequest', () => {
  it('executes generated bindings without TypeScript type analysis at runtime', async () => {
    const result = await executeGraphqlRequest({
      runtime,
      resolvers: [RuntimeViewerResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ viewer { id posts } }' },
    });

    expect(result).toEqual({
      data: {
        viewer: {
          id: 'viewer',
          posts: ['first'],
        },
      },
    });
  });

  it('uses invocation hook params before calling a root resolver', async () => {
    type HookedUserInput = {
      readonly id: string;
    };

    @Resolver()
    class HookedUserResolver {
      @Query()
      user(input: HookedUserInput): ViewerPublic {
        return { id: input.id };
      }
    }

    const hookContexts: unknown[] = [];
    const hookRuntime = {
      schemaSdl: `type Query {
  user(id: String!): ViewerPublic!
}

type ViewerPublic {
  id: String!
}
`,
      bindings: {
        Query: {
          user: { resolver: 'HookedUserResolver', method: 'user', hook: 'Query.user' },
        },
      },
      invocationHooks: {
        'Query.user': async (ctx: {
          readonly parent: unknown;
          readonly args: Readonly<Record<string, unknown>>;
          readonly isRootField: boolean;
        }): Promise<readonly unknown[]> => {
          hookContexts.push(ctx);
          return [{ id: `${String(ctx.args['id'])}-validated` }];
        },
      },
    } satisfies GeneratedGraphqlRuntime;

    const result = await executeGraphqlRequest({
      runtime: hookRuntime,
      resolvers: [HookedUserResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ user(id: "user-1") { id } }' },
    });

    expect(result).toEqual({
      data: {
        user: { id: 'user-1-validated' },
      },
    });
    expect(hookContexts).toEqual([
      {
        parent: undefined,
        args: { id: 'user-1' },
        isRootField: true,
      },
    ]);
  });

  it('keeps args default parameter fallback when binding has no invocation hook', async () => {
    const FallbackInput = v.object({
      id: v.pipe(v.string(), v.minLength(1)),
    });

    @Resolver()
    class FallbackArgsResolver {
      @Query()
      user(input = args(FallbackInput)): ViewerPublic {
        return { id: input.id };
      }
    }

    const fallbackRuntime = {
      schemaSdl: `type Query {
  user(id: String!): ViewerPublic!
}

type ViewerPublic {
  id: String!
}
`,
      bindings: {
        Query: {
          user: { resolver: 'FallbackArgsResolver', method: 'user' },
        },
      },
    } satisfies GeneratedGraphqlRuntime;

    const result = await executeGraphqlRequest({
      runtime: fallbackRuntime,
      resolvers: [FallbackArgsResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ user(id: "fallback-user") { id } }' },
    });

    expect(result).toEqual({
      data: {
        user: { id: 'fallback-user' },
      },
    });
  });

  it('rejects generated runtime bindings with an empty invocation hook name', async () => {
    const runtimeModulePath = join(
      tmpdir(),
      `zelt-graphql-empty-hook-${Date.now()}-${Math.random()}.mjs`,
    );
    await writeFile(
      runtimeModulePath,
      `export const graphqlRuntime = ${JSON.stringify({
        schemaSdl: `type Query {
  viewer: ViewerPublic!
}

type ViewerPublic {
  id: String!
}
`,
        bindings: {
          Query: {
            viewer: { resolver: 'RuntimeViewerResolver', method: 'viewer', hook: '' },
          },
        },
      })};\n`,
      'utf8',
    );

    await expect(loadGeneratedGraphqlRuntime(runtimeModulePath)).rejects.toThrow(
      /GraphQL runtime module must export graphqlRuntime/,
    );
  });

  it('enriches GraphqlArgsValidationError thrown from an invocation hook', async () => {
    @Resolver()
    class HookValidationResolver {
      @Query()
      user(input: ViewerPublic): ViewerPublic {
        return input;
      }
    }

    const validationRuntime = {
      schemaSdl: `type Query {
  user(id: String!): ViewerPublic!
}

type ViewerPublic {
  id: String!
}
`,
      bindings: {
        Query: {
          user: { resolver: 'HookValidationResolver', method: 'user', hook: 'Query.user' },
        },
      },
      invocationHooks: {
        'Query.user': (): readonly unknown[] => {
          throw new GraphqlArgsValidationError([{ message: 'id is invalid' }]);
        },
      },
    } satisfies GeneratedGraphqlRuntime;

    const result = await executeGraphqlRequest({
      runtime: validationRuntime,
      resolvers: [HookValidationResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ user(id: "") { id } }' },
    });

    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.extensions?.['code']).toBe('GRAPHQL_ARGS_VALIDATION_FAILED');
    expect(result.errors?.[0]?.extensions?.['issues']).toEqual([{ message: 'id is invalid' }]);
  });

  it('enriches structurally compatible args validation errors thrown from an invocation hook', async () => {
    class GeneratedHelperGraphqlArgsValidationError extends Error {
      readonly issues = [{ message: 'id is invalid from generated helper' }];

      constructor() {
        super('GraphQL args validation failed: id is invalid from generated helper');
        this.name = 'GraphqlArgsValidationError';
      }
    }

    @Resolver()
    class StructuralHookValidationResolver {
      @Query()
      user(input: ViewerPublic): ViewerPublic {
        return input;
      }
    }

    const validationRuntime = {
      schemaSdl: `type Query {
  user(id: String!): ViewerPublic!
}

type ViewerPublic {
  id: String!
}
`,
      bindings: {
        Query: {
          user: {
            resolver: 'StructuralHookValidationResolver',
            method: 'user',
            hook: 'Query.user',
          },
        },
      },
      invocationHooks: {
        'Query.user': (): readonly unknown[] => {
          throw new GeneratedHelperGraphqlArgsValidationError();
        },
      },
    } satisfies GeneratedGraphqlRuntime;

    const result = await executeGraphqlRequest({
      runtime: validationRuntime,
      resolvers: [StructuralHookValidationResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ user(id: "") { id } }' },
    });

    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.extensions?.['code']).toBe('GRAPHQL_ARGS_VALIDATION_FAILED');
    expect(result.errors?.[0]?.extensions?.['issues']).toEqual([
      { message: 'id is invalid from generated helper' },
    ]);
  });
});

type StockStatus = 'in_stock' | 'low_stock';

@Resolver()
class EnumRuntimeResolver {
  @Query()
  stockStatus(): StockStatus {
    return 'low_stock';
  }

  @ResolveField()
  status(_parent: ViewerPublic): StockStatus {
    return 'in_stock';
  }
}

const enumRuntime = {
  schemaSdl: `type Query {
  stockStatus: StockStatus!
  viewer: ViewerPublic!
}

type ViewerPublic {
  id: String!
  status: StockStatus!
}

enum StockStatus {
  IN_STOCK
  LOW_STOCK
}
`,
  bindings: {
    Query: {
      stockStatus: { resolver: 'EnumRuntimeResolver', method: 'stockStatus' },
      viewer: { resolver: 'RuntimeViewerResolver', method: 'viewer' },
    },
    ViewerPublic: {
      status: { resolver: 'EnumRuntimeResolver', method: 'status' },
    },
  },
  enumFields: {
    Query: {
      stockStatus: { in_stock: 'IN_STOCK', low_stock: 'LOW_STOCK' },
    },
    ViewerPublic: {
      status: { in_stock: 'IN_STOCK', low_stock: 'LOW_STOCK' },
    },
  },
} satisfies GeneratedGraphqlRuntime;

describe('executeGraphqlRequest enum conversion', () => {
  it('converts enum values on root fields and bound field resolvers', async () => {
    const result = await executeGraphqlRequest({
      runtime: enumRuntime,
      resolvers: [EnumRuntimeResolver, RuntimeViewerResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ stockStatus viewer { status } }' },
    });

    expect(result).toEqual({
      data: {
        stockStatus: 'LOW_STOCK',
        viewer: { status: 'IN_STOCK' },
      },
    });
  });

  it('converts enum values inside array returns', async () => {
    const arrayEnumRuntime = {
      schemaSdl: `type Query {
  allStatuses: [StockStatus!]!
}

enum StockStatus {
  IN_STOCK
  LOW_STOCK
}
`,
      bindings: {
        Query: {
          allStatuses: { resolver: 'ArrayEnumResolver', method: 'allStatuses' },
        },
      },
      enumFields: {
        Query: {
          allStatuses: { in_stock: 'IN_STOCK', low_stock: 'LOW_STOCK' },
        },
      },
    } satisfies GeneratedGraphqlRuntime;

    @Resolver()
    class ArrayEnumResolver {
      @Query()
      allStatuses(): readonly StockStatus[] {
        return ['in_stock', 'low_stock'];
      }
    }

    const result = await executeGraphqlRequest({
      runtime: arrayEnumRuntime,
      resolvers: [ArrayEnumResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ allStatuses }' },
    });

    expect(result).toEqual({ data: { allStatuses: ['IN_STOCK', 'LOW_STOCK'] } });
  });

  it('converts enum values on plain object properties without bindings', async () => {
    const plainEnumRuntime = {
      schemaSdl: `type Query {
  viewer: ViewerPublic!
}

type ViewerPublic {
  id: String!
  status: StockStatus!
}

enum StockStatus {
  IN_STOCK
  LOW_STOCK
}
`,
      bindings: {
        Query: {
          viewer: { resolver: 'PlainEnumResolver', method: 'viewer' },
        },
      },
      enumFields: {
        ViewerPublic: {
          status: { in_stock: 'IN_STOCK', low_stock: 'LOW_STOCK' },
        },
      },
    } satisfies GeneratedGraphqlRuntime;

    @Resolver()
    class PlainEnumResolver {
      @Query()
      viewer(): ViewerPublic & { status: StockStatus } {
        return { id: 'viewer', status: 'low_stock' };
      }
    }

    const result = await executeGraphqlRequest({
      runtime: plainEnumRuntime,
      resolvers: [PlainEnumResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ viewer { id status } }' },
    });

    expect(result).toEqual({ data: { viewer: { id: 'viewer', status: 'LOW_STOCK' } } });
  });
});

const RuntimeMoneyScalar = gqlScalar<{ readonly cents: number }>('Money', {
  serialize: (value) => value.cents,
});

type RuntimeSearchResult =
  | { readonly productId: string; readonly name: string }
  | { readonly categoryId: string; readonly label: string };

describe('executeGraphqlRequest scalar and union output', () => {
  it('serializes custom scalar values through the registered scalar codec', async () => {
    const scalarRuntime = {
      schemaSdl: `scalar Money

type Query {
  price: PricePublic!
}

type PricePublic {
  amount: Money!
}
`,
      bindings: {
        Query: {
          price: { resolver: 'ScalarRuntimeResolver', method: 'price' },
        },
      },
      scalars: {
        Money: RuntimeMoneyScalar,
      },
    } satisfies GeneratedGraphqlRuntime;

    @Resolver()
    class ScalarRuntimeResolver {
      @Query()
      price(): { readonly amount: { readonly cents: number } } {
        return { amount: { cents: 1299 } };
      }
    }

    const result = await executeGraphqlRequest({
      runtime: scalarRuntime,
      resolvers: [ScalarRuntimeResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ price { amount } }' },
    });

    expect(result).toEqual({ data: { price: { amount: 1299 } } });
  });

  it('resolves named object unions from object field sets without requiring __typename', async () => {
    const unionRuntime = {
      schemaSdl: `type Query {
  search: [SearchResult!]!
}

union SearchResult = ProductSearchResult | CategorySearchResult

type ProductSearchResult {
  productId: String!
  name: String!
}

type CategorySearchResult {
  categoryId: String!
  label: String!
}
`,
      bindings: {
        Query: {
          search: { resolver: 'UnionRuntimeResolver', method: 'search' },
        },
      },
      unions: {
        SearchResult: {
          ProductSearchResult: ['productId', 'name'],
          CategorySearchResult: ['categoryId', 'label'],
        },
      },
    } satisfies GeneratedGraphqlRuntime;

    @Resolver()
    class UnionRuntimeResolver {
      @Query()
      search(): readonly RuntimeSearchResult[] {
        return [
          { productId: 'p1', name: 'Keyboard' },
          { categoryId: 'c1', label: 'Accessories' },
        ];
      }
    }

    const result = await executeGraphqlRequest({
      runtime: unionRuntime,
      resolvers: [UnionRuntimeResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: {
        query: `{
          search {
            ... on ProductSearchResult { productId name }
            ... on CategorySearchResult { categoryId label }
          }
        }`,
      },
    });

    expect(result).toEqual({
      data: {
        search: [
          { productId: 'p1', name: 'Keyboard' },
          { categoryId: 'c1', label: 'Accessories' },
        ],
      },
    });
  });
});

describe('GraphQL request payload', () => {
  it('treats null variables and operationName as absent', async () => {
    const result = await executeGraphqlRequest({
      runtime,
      resolvers: [RuntimeViewerResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ viewer { id } }', variables: null, operationName: null },
    });

    expect(result).toEqual({ data: { viewer: { id: 'viewer' } } });
  });
});

describe('createGraphqlExecutor validation rules', () => {
  it('applies custom validation rules to reject queries', async () => {
    const { GraphQLError: GQLError } = await import('graphql');
    const rejectAll: import('graphql').ValidationRule = (ctx) => ({
      OperationDefinition: () => {
        ctx.reportError(new GQLError('blocked by custom rule'));
      },
    });

    const execute = createGraphqlExecutor({
      runtime,
      resolvers: [RuntimeViewerResolver],
      resolveResolver: (resolver) => new resolver() as object,
      validationRules: [rejectAll],
    });

    const result = await execute({ query: '{ viewer { id } }' });
    expect(result.errors?.[0]?.message).toBe('blocked by custom rule');
    expect(result.data).toBeUndefined();
  });
});

describe('executeGraphqlRequest enum input args', () => {
  it('passes GraphQL enum arg value through args to the resolver', async () => {
    const StatusInput = v.object({ status: v.string() });

    @Resolver()
    class EnumInputResolver {
      @Query()
      itemByStatus(input = args(StatusInput)): { status: string } {
        return { status: input.status };
      }
    }

    const enumInputRuntime = {
      schemaSdl: `type Query {
  itemByStatus(status: StockStatus!): ItemResult!
}

type ItemResult {
  status: String!
}

enum StockStatus {
  IN_STOCK
  LOW_STOCK
}
`,
      bindings: {
        Query: {
          itemByStatus: { resolver: 'EnumInputResolver', method: 'itemByStatus' },
        },
      },
    } satisfies GeneratedGraphqlRuntime;

    const result = await executeGraphqlRequest({
      runtime: enumInputRuntime,
      resolvers: [EnumInputResolver],
      resolveResolver: (resolver) => new resolver() as object,
      request: { query: '{ itemByStatus(status: IN_STOCK) { status } }' },
    });

    expect(result).toEqual({
      data: { itemByStatus: { status: 'IN_STOCK' } },
    });
  });
});

describe('graphql HTTP runtime', () => {
  it('loads generated runtime module during HTTP runtime creation, then handles requests', async () => {
    const runtimeModulePath = join(
      tmpdir(),
      `zelt-graphql-runtime-${Date.now()}-${Math.random()}.mjs`,
    );
    await writeFile(
      runtimeModulePath,
      `globalThis.__zeltGraphqlRuntimeEvents?.push('loaded');\nexport const graphqlRuntime = ${JSON.stringify(runtime)};\n`,
      'utf8',
    );

    const events: string[] = [];
    Reflect.set(globalThis, '__zeltGraphqlRuntimeEvents', events);
    const app = createApp([
      http({
        controllers: [],
        children: [
          graphql({
            path: '/graphql',
            resolvers: [RuntimeViewerResolver],
            runtimeModule: pathToFileURL(runtimeModulePath).href,
          }),
        ],
      }),
    ]);

    const running = await app.createRuntime();
    expect(events).toEqual(['loaded', 'resolver']);

    const response = await running.http.request('/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ viewer { id posts } }' }),
    });

    await expect(response.json()).resolves.toEqual({
      data: {
        viewer: {
          id: 'viewer',
          posts: ['first'],
        },
      },
    });

    const nullFieldsResponse = await running.http.request('/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ viewer { id } }', variables: null, operationName: null }),
    });
    expect(nullFieldsResponse.status).toBe(200);
    await expect(nullFieldsResponse.json()).resolves.toEqual({
      data: { viewer: { id: 'viewer' } },
    });
  });

  it('keeps GraphQL execution state isolated between runtimes of the same app', async () => {
    const runtimeModulePath = join(
      tmpdir(),
      `zelt-graphql-runtime-iso-${Date.now()}-${Math.random()}.mjs`,
    );
    const isolationRuntime = {
      schemaSdl: `type Query {\n  seq: Float!\n}\n`,
      bindings: { Query: { seq: { resolver: 'SeqResolver', method: 'seq' } } },
    } satisfies GeneratedGraphqlRuntime;
    await writeFile(
      runtimeModulePath,
      `export const graphqlRuntime = ${JSON.stringify(isolationRuntime)};\n`,
      'utf8',
    );

    let instanceSeq = 0;
    @Resolver()
    class SeqResolver {
      private readonly instanceNumber = ++instanceSeq;

      @Query()
      seq(): number {
        return this.instanceNumber;
      }
    }

    const app = createApp([
      http({
        controllers: [],
        children: [
          graphql({
            path: '/graphql',
            resolvers: [SeqResolver],
            runtimeModule: pathToFileURL(runtimeModulePath).href,
          }),
        ],
      }),
    ]);

    const first = await app.createRuntime();
    const second = await app.createRuntime();

    const querySeq = async (runtime: typeof first): Promise<unknown> => {
      const response = await runtime.http.request('/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ seq }' }),
      });
      const payload: { data?: { seq?: unknown } } = await response.json();
      return payload.data?.seq;
    };

    // Each runtime must keep executing with its own resolver instances even
    // after another runtime was created from the same app definition.
    await expect(querySeq(second)).resolves.toBe(2);
    await expect(querySeq(first)).resolves.toBe(1);
  });
});
