export type JsonSchema = {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
  readonly $ref?: string;
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly [key: string]: unknown;
};

export type SchemaAdapter = {
  readonly toJsonSchema: (schema: unknown) => JsonSchema;
};
