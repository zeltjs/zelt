import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { JsonSchema, SchemaAdapter } from './schema.types';

// Caller-supplied module loader. Required when the schema module is a `.ts`
// file that the calling runtime (vitest, tsx) can resolve through its loader
// but Node.js's bare `import()` cannot. CLI/production paths can omit it and
// rely on the default `import(file:// url)` against compiled `.js` output.
export type SchemaResolver = (modulePath: string) => Promise<Record<string, unknown>>;

// Bare specifiers (`valibot`, `@scope/pkg`) must reach `import()` untouched so
// Node's resolver can find them in node_modules. Only filesystem paths get
// converted to file:// URLs.
const toImportSpecifier = (modulePath: string): string => {
  if (modulePath.startsWith('file:')) return modulePath;
  if (isAbsolute(modulePath) || modulePath.startsWith('./') || modulePath.startsWith('../')) {
    return pathToFileURL(modulePath).href;
  }
  return modulePath;
};

/** @throws {Error} */
const defaultResolver: SchemaResolver = async (modulePath) => {
  const specifier = toImportSpecifier(modulePath);
  const imported: unknown = await import(specifier);
  if (typeof imported !== 'object' || imported === null) {
    throw new Error(`Module '${modulePath}' did not resolve to an object`);
  }
  const mod: Record<string, unknown> = { ...imported };
  return mod;
};

/** @throws {Error} when the module cannot be imported or the export is missing */
export const resolveValidatedSchema = async (
  modulePath: string,
  exportName: string,
  adapter: SchemaAdapter,
  resolver: SchemaResolver = defaultResolver,
): Promise<JsonSchema> => {
  const mod = await resolver(modulePath);
  const value = mod[exportName];
  if (value === undefined) {
    throw new Error(`Export '${exportName}' not found in module '${modulePath}'`);
  }
  return adapter.toJsonSchema(value);
};
