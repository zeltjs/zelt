// Accepts whatever JSON Schema object the validator adapter emits
// (@valibot/to-json-schema, zod-to-json-schema, ...). Reading it structurally
// at runtime avoids coupling to any one adapter's TypeScript JSON Schema type;
// the shared type-analysis package boundary is still an open question in the
// GraphQL requirements.
export type GraphqlSchemaAdapter = {
  toJsonSchema: (schema: unknown) => unknown;
};

export type GraphqlArg = {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
};

const scalarTypeMap: Readonly<Record<string, string>> = {
  string: 'String',
  integer: 'Int',
  number: 'Float',
  boolean: 'Boolean',
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : undefined;

/** @throws {Error} */
const convertListArgType = (name: string, node: Record<string, unknown>): string | undefined => {
  if (node['type'] !== 'array') return undefined;
  if (node['items'] === undefined || Array.isArray(node['items'])) return undefined;
  return `[${convertArgType(name, node['items'])}!]`;
};

/** @throws {Error} */
const convertArgType = (name: string, schema: unknown): string => {
  const node = asRecord(schema);
  if (node && typeof node['type'] === 'string') {
    const converted = scalarTypeMap[node['type']] ?? convertListArgType(name, node);
    if (converted) return converted;
  }
  throw new Error(`Unsupported GraphQL arg type for '${name}': ${JSON.stringify(node?.['type'])}`);
};

const readRequired = (value: unknown): ReadonlySet<string> => {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.flatMap((entry) => (typeof entry === 'string' ? [entry] : [])));
};

/** @throws {Error} */
export const jsonSchemaToGraphqlArgs = (schema: unknown): readonly GraphqlArg[] => {
  const node = asRecord(schema);
  const properties = node ? asRecord(node['properties']) : undefined;
  if (!node || node['type'] !== 'object' || properties === undefined) {
    throw new Error('gqlValidated schema must be a top-level object schema.');
  }

  const required = readRequired(node['required']);
  return Object.entries(properties).map(([name, propSchema]) => ({
    name,
    type: convertArgType(name, propSchema),
    nullable: !required.has(name),
  }));
};

export const renderGraphqlArgs = (args: readonly GraphqlArg[]): string => {
  if (args.length === 0) return '';
  const rendered = args.map((arg) => `${arg.name}: ${arg.type}${arg.nullable ? '' : '!'}`);
  return `(${rendered.join(', ')})`;
};
