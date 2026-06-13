import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createApp, http } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';
import type { GeneratedGraphqlRuntime } from './graphql-runtime.lib';
import { createGraphqlExecutor, executeGraphqlRequest } from './graphql-runtime.lib';
import { graphql, Query, ResolveField, Resolver } from './index';

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
