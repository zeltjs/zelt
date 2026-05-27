export type JsonSchema = {
  readonly type?: string | readonly string[];
  readonly properties?: Record<string, JsonSchema>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
  readonly $ref?: string;
  readonly definitions?: Record<string, JsonSchema>;
  readonly [key: string]: unknown;
};

export type SchemaAdapter = {
  toJsonSchema: (schema: unknown) => JsonSchema;
};
