import { match } from 'ts-pattern';
import type {
  GraphqlModelProperty,
  GraphqlModelResultShape,
  GraphqlModelValue,
} from './graphql-model.types';

const nullableType = (type: string, nullable: boolean): string =>
  nullable ? type.replace(/!$/, '') : type;

/**
 * @throws {Error} from graphql-model-shape.lib.ts:anonymous_L20
 */
export const renderGraphqlModelValue = (value: GraphqlModelValue): string =>
  match(value)
    .with(
      { kind: 'scalar' },
      ({ name }) => `${{ ID: 'ID', string: 'String', number: 'Float', boolean: 'Boolean' }[name]}!`,
    )
    .with({ kind: 'array' }, ({ item }) => `[${renderGraphqlModelValue(item)}]!`)
    .with({ kind: 'nullable' }, ({ inner }) => nullableType(renderGraphqlModelValue(inner), true))
    .with({ kind: 'optional' }, ({ inner }) => nullableType(renderGraphqlModelValue(inner), true))
    .with({ kind: 'opaque' }, () => {
      throw new Error('Opaque model data cannot be exposed in GraphQL');
    })
    .exhaustive();

/**
 * @throws {Error} from graphql-model-shape.lib.ts:anonymous_L20
 */
export const renderGraphqlModelProperty = (property: GraphqlModelProperty): string =>
  nullableType(renderGraphqlModelValue(property.value), property.optional);

export const renderGraphqlModelResult = (
  target: string,
  shape: GraphqlModelResultShape,
): string => {
  const inner =
    shape.kind === 'one' ? `${target}!` : `[${nullableType(`${target}!`, shape.itemNullable)}]!`;
  return nullableType(inner, shape.nullable);
};
