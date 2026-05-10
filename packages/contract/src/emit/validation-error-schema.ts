import type { JsonSchema } from '../types/schema-adapter';

export const validationErrorBodyJsonSchema: JsonSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', const: 'VALIDATION_FAILED' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string' },
          type: { type: 'string' },
          message: { type: 'string' },
          path: { type: 'array' },
        },
        required: ['kind', 'type', 'message'],
      },
    },
  },
  required: ['code', 'issues'],
};
