import type { DrizzleRepositoryOptions } from './generation.types';
import { fieldOf } from './row.lib';

export const PLUGIN_NAME = 'drizzle-repository';

export const formatErrors = (errors: readonly { readonly message: string }[]): string =>
  ['drizzle-repository: generation failed', ...errors.map((error) => `- ${error.message}`)].join(
    '\n',
  );

const stringOf = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const schemaOf = (value: unknown): DrizzleRepositoryOptions['schema'] | undefined => {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return undefined;
  const paths = value.flatMap((item: unknown) => (typeof item === 'string' ? [item] : []));
  return paths.length === value.length ? paths : undefined;
};

// The CLI reads the options back from the plugin object of the loaded zelt config.
export const optionsOf = (plugin: unknown): DrizzleRepositoryOptions | undefined => {
  const options = fieldOf(plugin, 'options');
  const schema = schemaOf(fieldOf(options, 'schema'));
  const database = fieldOf(options, 'database');
  const from = stringOf(fieldOf(database, 'from'));
  const name = stringOf(fieldOf(database, 'name'));
  const out = fieldOf(options, 'out');
  const model = stringOf(fieldOf(out, 'model'));
  const repository = stringOf(fieldOf(out, 'repository'));
  if (schema === undefined || from === undefined || name === undefined) return undefined;
  if (model === undefined || repository === undefined) return undefined;
  return { schema, database: { from, name }, out: { model, repository } };
};
