import { resolve } from 'node:path';
import { toJsonSchema } from '@valibot/to-json-schema';
import { describe, expect, it } from 'vitest';
import { GetUserInput } from './gql-args-sample.lib';
import { executeGraphqlRequest } from './graphql-runtime.lib';
import { generateGraphqlRuntimeForResolvers } from './graphql-sdl-generator.lib';
import type { GqlOutput } from './index';
import { args, gqlScalar, QueryData, Resolver } from './index';

@Resolver()
class StatusResolver {
  @QueryData()
  health() {
    return { status: true };
  }

  @QueryData('echo')
  value(input = args(GetUserInput)): string {
    return input.id;
  }
}

type Money = { readonly cents: number };

export const MoneyScalar = gqlScalar<Money>('Money', { serialize: (value) => value.cents });

@Resolver()
class DirectDataResolver {
  @QueryData()
  money(): Money {
    return { cents: 100 };
  }
}

@Resolver()
class NamedTypesResolver {
  @QueryData()
  amount(): GqlOutput<typeof MoneyScalar> {
    return { cents: 250 };
  }
}

describe('@QueryData', () => {
  it.each([
    ['direct data first', [DirectDataResolver, NamedTypesResolver]],
    ['named types first', [NamedTypesResolver, DirectDataResolver]],
  ] as const)('fails instead of renaming types whose names collide (%s)', async (_, resolvers) => {
    await expect(
      generateGraphqlRuntimeForResolvers(resolvers, {
        tsconfig: resolve(__dirname, '../tsconfig.json'),
      }),
    ).rejects.toThrow(/type name conflict: Money/);
  });

  it('generates and executes an endpoint with only direct values and validated arguments', async () => {
    const runtime = await generateGraphqlRuntimeForResolvers([StatusResolver], {
      tsconfig: resolve(__dirname, '../tsconfig.json'),
      schemaAdapter: {
        toJsonSchema: (schema) => {
          if (schema !== GetUserInput) throw new Error('Unexpected argument schema');
          return toJsonSchema(GetUserInput);
        },
      },
      schemaResolver: (modulePath) => import(/* @vite-ignore */ modulePath),
    });
    expect(runtime.models).toBeUndefined();
    expect(runtime.schemaSdl).toContain('status: Boolean!');
    const result = await executeGraphqlRequest({
      runtime,
      resolvers: [StatusResolver],
      resolveResolver: (resolver) => new resolver(),
      request: { query: '{ health { status } echo(id: "hello") }' },
    });
    expect(result).toEqual({ data: { health: { status: true }, echo: 'hello' } });
  });
});
