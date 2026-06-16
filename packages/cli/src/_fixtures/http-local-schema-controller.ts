import { Controller, Post, validated } from '@zeltjs/core';

type LocalStandardSchema = {
  readonly '~standard': {
    version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) =>
      | { readonly value: { readonly id: string } }
      | { readonly issues: readonly { readonly message: string }[] };
    types: undefined;
  };
};

const readProperty = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

export const LocalArtifactSchema: LocalStandardSchema = {
  '~standard': {
    version: 1,
    vendor: 'zelt-test',
    validate: (value) => {
      const id = readProperty(value, 'id');
      if (id !== undefined) {
        return { value: { id: String(id) } };
      }
      return { issues: [{ message: 'Invalid local artifact' }] };
    },
    types: undefined,
  },
};

@Controller('/local-artifact')
export class LocalArtifactController {
  @Post('/')
  create(data = validated(LocalArtifactSchema)) {
    return data;
  }
}
