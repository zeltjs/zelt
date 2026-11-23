import { dirname } from 'node:path';

import type { DomainChild } from './domain.lib';
import type { EmitPaths } from './emit-shared.lib';
import {
  excludedOf,
  GENERATED_HEADER,
  modelColumnsOf,
  property,
  quote,
  schemaImports,
  specifier,
  tablesOf,
} from './emit-shared.lib';
import type { DomainNames, Names } from './naming.lib';

const result = (value: string, error: string): string => `$ResultAsync<${value}, ${error}>`;

const foreignKeyOf = (child: DomainChild) => ({
  columns: child.link.map((pair) => pair.column),
  parentColumns: child.link.map((pair) => pair.parent),
});

const childDefinition = (
  child: DomainChild,
  indent: string,
  ref: (exportName: string) => string,
): string => {
  const nested = child.children.map((grandChild) =>
    childDefinition(grandChild, `${indent}  `, ref),
  );
  return [
    `${indent}{`,
    `${indent}  relation: ${quote(child.relation)},`,
    `${indent}  table: ${ref(child.exportName)},`,
    `${indent}  primaryKey: ${quote(child.primaryKey)},`,
    `${indent}  foreignKey: ${JSON.stringify(foreignKeyOf(child))},`,
    `${indent}  columns: ${JSON.stringify(modelColumnsOf(child))},`,
    `${indent}  excludedColumns: ${JSON.stringify(excludedOf(child))},`,
    `${indent}  children: [${nested.length === 0 ? '' : `\n${nested.join(',\n')}\n${indent}  `}],`,
    `${indent}}`,
  ].join('\n');
};

const method = (signature: string, body: string): string =>
  [`  ${signature} {`, `    ${body}`, `  }`].join('\n');

const uniqueMethods = (own: DomainNames, row: string): string[] =>
  own.uniqueKeys.map((key) => {
    const [single, ...rest] = key.columns;
    const isSingle = single !== undefined && rest.length === 0;
    const fields = key.columns
      .map((column) => `${property(column)}: ${row}[${quote(column)}]`)
      .join('; ');
    const keyType = isSingle ? `${row}[${quote(single)}]` : `{ ${fields} }`;
    const keyValue = isSingle ? `{ ${property(single)}: key }` : 'key';
    const resultType = result(
      `{ id: ${own.existedId} } | { id: $repository.NOT_EXIST; ${fields} }`,
      '$repository.DbError',
    );
    return method(
      `${key.method}(key: ${keyType}): ${resultType}`,
      `return $engine.isExistedBy($domain, this.db, ${quote(key.key)}, ${keyValue}) as ${resultType};`,
    );
  });

const finderMethods = (own: DomainNames, names: Names): string[] =>
  own.finders.flatMap((finder) => {
    const target = names.get(finder.root);
    if (target === undefined) return [];
    const resultType = result(`${own.model}[]`, '$repository.DbError');
    return method(
      `${finder.method}(key: ${target.existedId}): ${resultType}`,
      `return $engine.findBy($domain, this.db, { ${property(finder.column)}: key }) as ${resultType};`,
    );
  });

const baseMethods = ({ model, id, existedId, newModel }: DomainNames): string[] => {
  const isExistedType = result(`${existedId} | $repository.NOT_EXIST`, '$repository.DbError');
  const getByIdType = result(model, '$repository.EntityNotFoundError | $repository.DbError');
  const writeType = (value: string): string =>
    result(value, '$repository.ConflictError | $repository.DbError');
  return [
    method(
      `isExisted(id: ${id}): ${isExistedType}`,
      `return $engine.isExisted($domain, this.db, id) as ${isExistedType};`,
    ),
    method(
      `getById(id: ${existedId}): ${getByIdType}`,
      `return $engine.getById($domain, this.db, id) as ${getByIdType};`,
    ),
    method(
      `save(value: $repository.SaveInput<${model}, ${newModel}>): ${writeType(model)}`,
      `return $engine.save($domain, this.db, value) as ${writeType(model)};`,
    ),
    method(
      `delete(model: ${model}): ${writeType('void')}`,
      'return $engine.remove($domain, this.db, model);',
    ),
  ];
};

const domainDefinition = (
  { domain, model, uniqueKeys }: DomainNames,
  drizzleMajor: 0 | 1,
  ref: (exportName: string) => string,
): string[] => {
  const children = domain.children.map((child) => childDefinition(child, '    ', ref));
  const lockColumn = domain.columns.find((column) => column.kind === 'lock')?.key;
  return [
    `const $domain = $engine.defineDomain({`,
    `  name: ${quote(model)},`,
    `  drizzleMajor: ${drizzleMajor},`,
    `  dialect: ${quote(domain.dialect)},`,
    `  queryKey: ${quote(domain.exportName)},`,
    `  table: ${ref(domain.exportName)},`,
    `  primaryKey: ${quote(domain.primaryKey)},`,
    `  columns: ${JSON.stringify(modelColumnsOf(domain))},`,
    `  excludedColumns: ${JSON.stringify(excludedOf(domain))},`,
    `  lockColumn: ${lockColumn === undefined ? 'undefined' : quote(lockColumn)},`,
    `  uniqueKeys: ${JSON.stringify(uniqueKeys.map(({ key, columns }) => ({ name: key, columns })))},`,
    `  children: [${children.length === 0 ? '' : `\n${children.join(',\n')}\n  `}],`,
    `});`,
  ];
};

const imports = (
  own: DomainNames,
  names: Names,
  paths: EmitPaths,
  schemaLines: readonly string[],
) => {
  const modelPath = (target: DomainNames): string =>
    quote(specifier(dirname(own.repositoryFile), target.modelFile));
  const finderTargets = [
    ...new Set(own.finders.flatMap((finder) => names.get(finder.root) ?? [])),
  ].filter((target) => target !== own);
  return [
    `import { Injectable as $Injectable, inject as $inject } from "@zeltjs/core";`,
    `import type * as $repository from "@zeltjs/drizzle-repository";`,
    `import * as $engine from "@zeltjs/drizzle-repository/engine";`,
    `import type { ResultAsync as $ResultAsync } from "neverthrow";`,
    '',
    `import { ${paths.databaseName} as $Database } from ${quote(paths.databaseFromRepository)};`,
    ...schemaLines,
    `import type { ${own.model}, ${own.existedId}, ${own.id}, ${own.newModel} } from ${modelPath(own)};`,
    ...finderTargets.map(
      (target) => `import type { ${target.existedId} } from ${modelPath(target)};`,
    ),
  ];
};

export const emitRepository = (
  own: DomainNames,
  drizzleMajor: 0 | 1,
  names: Names,
  paths: EmitPaths,
): string => {
  const { domain } = own;
  const tables = [domain, ...tablesOf(domain.children)];
  const schema = schemaImports(
    'import',
    tables.map((table) => table.exportName),
    paths.schemaFromRepository,
  );
  const row = `(typeof ${schema.ref(domain.exportName)}.$inferSelect)`;
  const [isExisted, getById, save, remove] = baseMethods(own);
  const methods = [
    isExisted,
    getById,
    ...uniqueMethods(own, row),
    ...finderMethods(own, names),
    save,
    remove,
  ];

  return [
    GENERATED_HEADER,
    ...imports(own, names, paths, schema.lines),
    '',
    ...domainDefinition(own, drizzleMajor, schema.ref),
    '',
    `@$Injectable()`,
    `export class ${own.repository} {`,
    `  private readonly db = $inject($Database);`,
    ...methods.flatMap((text) => ['', text ?? '']),
    `}`,
    '',
  ].join('\n');
};
