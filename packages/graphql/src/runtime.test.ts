import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createApp, http } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';
import type { GeneratedGraphqlRuntime } from './graphql-runtime.lib';
import { executeGraphqlRequest } from './graphql-runtime.lib';
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
          graphql('/graphql', {
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
  });
});
