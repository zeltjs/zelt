import { relative } from 'node:path';

import { GENERATED_FILE_HEADER_MARKER } from '@zeltjs/cli';

import type { Domain, DomainChild } from './domain.lib';

// zelt build deletes a file it no longer produces only when the file carries this marker.
export const GENERATED_HEADER = `// ${GENERATED_FILE_HEADER_MARKER}\n`;

export type EmitPaths = {
  // Import specifiers, relative to the directory of each generated file.
  // Export name of each table -> the module that exports it.
  readonly schemaFromModel: ReadonlyMap<string, string>;
  readonly schemaFromRepository: ReadonlyMap<string, string>;
  readonly databaseFromRepository: string;
  readonly databaseName: string;
};

const withoutExtension = (path: string): string => path.replace(/\.(c|m)?(t|j)sx?$/, '');

export const specifier = (fromDirectory: string, to: string): string => {
  const path = withoutExtension(relative(fromDirectory, to)).split('\\').join('/');
  return path.startsWith('.') ? path : `./${path}`;
};

export const quote = (value: string): string => JSON.stringify(value);

// Column and relation keys come from the schema and may need quoting as property names.
export const property = (key: string): string =>
  /^[A-Za-z_$][\w$]*$/.test(key) ? key : quote(key);

// Tables, the database class and library names are imported under `$` names, so the names
// the user chose for tables and the names generated from them cannot collide with them.
type SchemaImports = {
  readonly lines: readonly string[];
  readonly ref: (exportName: string) => string;
};

export const schemaImports = (
  keyword: 'import' | 'import type',
  exportNames: readonly string[],
  modules: ReadonlyMap<string, string>,
): SchemaImports => {
  const namespaces = new Map<string, string>();
  for (const name of exportNames) {
    const module = modules.get(name);
    if (module !== undefined && !namespaces.has(module)) {
      namespaces.set(module, `$schema${namespaces.size}`);
    }
  }
  return {
    lines: [...namespaces].map(
      ([module, namespace]) => `${keyword} * as ${namespace} from ${quote(module)};`,
    ),
    ref: (exportName) => `${namespaces.get(modules.get(exportName) ?? '') ?? ''}.${exportName}`,
  };
};

export const union = (names: readonly string[]): string =>
  names.length === 0 ? 'never' : names.map(quote).join(' | ');

export const tablesOf = (children: Domain['children']): DomainChild[] =>
  children.flatMap((child) => [child, ...tablesOf(child.children)]);
