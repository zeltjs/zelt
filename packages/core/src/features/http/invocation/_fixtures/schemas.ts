import type { StandardSchemaV1 } from '@standard-schema/spec';

const readProperty = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

export const ImportedUserSchema: StandardSchemaV1<unknown, { readonly name: string }> = {
  '~standard': {
    version: 1,
    vendor: 'zelt-test',
    validate: (value) => {
      const name = readProperty(value, 'name');
      if (typeof name === 'string') {
        return { value: { name } };
      }
      return { issues: [{ message: 'Invalid user' }] };
    },
    types: undefined,
  },
};

export const httpInvocationHooks: StandardSchemaV1<unknown, { readonly name: string }> =
  ImportedUserSchema;

export const HttpInvocationHook: StandardSchemaV1<unknown, { readonly name: string }> =
  ImportedUserSchema;

export const makeSchema = (): StandardSchemaV1<unknown, { readonly name: string }> =>
  ImportedUserSchema;
