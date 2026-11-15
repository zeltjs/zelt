import { resolve } from 'node:path';
import { toJsonSchema } from '@valibot/to-json-schema';
import { buildSchema } from 'graphql';
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

type GaugeLevel = 'low' | 'high';

type Gauge = { readonly level: { readonly value: number } };

@Resolver()
class DirectDataResolver {
  @QueryData()
  money(): Money {
    return { cents: 100 };
  }

  @QueryData()
  gauge(): Gauge {
    return { level: { value: 3 } };
  }
}

@Resolver()
class NamedTypesResolver {
  @QueryData()
  amount(): GqlOutput<typeof MoneyScalar> {
    return { cents: 250 };
  }

  @QueryData()
  gaugeLevel(): GaugeLevel {
    return 'high';
  }
}

describe('@QueryData', () => {
  it.each([
    ['direct data first', [DirectDataResolver, NamedTypesResolver]],
    ['named types first', [NamedTypesResolver, DirectDataResolver]],
  ] as const)(
    'keeps generated type names apart from scalars and enums (%s)',
    async (_, resolvers) => {
      const runtime = await generateGraphqlRuntimeForResolvers(resolvers, {
        tsconfig: resolve(__dirname, '../tsconfig.json'),
      });
      expect(() => buildSchema(runtime.schemaSdl)).not.toThrow();
      expect(runtime.schemaSdl).toContain('scalar Money');
      const result = await executeGraphqlRequest({
        runtime,
        resolvers,
        resolveResolver: (resolver) => new resolver(),
        request: { query: '{ money { cents } amount gauge { level { value } } gaugeLevel }' },
      });
      expect(result).toEqual({
        data: {
          money: { cents: 100 },
          amount: 250,
          gauge: { level: { value: 3 } },
          gaugeLevel: 'HIGH',
        },
      });
    },
  );

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
