import type { Domain, DomainChild } from './domain.lib';
import type { EmitPaths, Roots } from './emit-shared.lib';
import {
  excludedOf,
  fileBaseName,
  GENERATED_HEADER,
  modelColumnsOf,
  property,
  quote,
  schemaImports,
  tablesOf,
} from './emit-shared.lib';

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

const uniqueMethods = (domain: Domain, row: string): string[] =>
  domain.uniqueKeys.map((key) => {
    const [single, ...rest] = key.columns;
    const isSingle = single !== undefined && rest.length === 0;
    const fields = key.columns
      .map((column) => `${property(column)}: ${row}[${quote(column)}]`)
      .join('; ');
    const keyType = isSingle ? `${row}[${quote(single)}]` : `{ ${fields} }`;
    const keyValue = isSingle ? `{ ${property(single)}: key }` : 'key';
    const resultType = result(
      `{ id: ${domain.typeName}ExistedId } | { id: $repository.NOT_EXIST; ${fields} }`,
      '$repository.DbError',
    );
    return method(
      `isExistedBy${key.name}(key: ${keyType}): ${resultType}`,
      `return $engine.isExistedBy($domain, this.db, ${quote(key.name)}, ${keyValue}) as ${resultType};`,
    );
  });

const finderMethods = (domain: Domain, roots: Roots): string[] =>
  domain.finders.map((finder) => {
    const targetType = `${roots.get(finder.target)?.typeName ?? ''}ExistedId`;
    const resultType = result(`${domain.typeName}[]`, '$repository.DbError');
    return method(
      `findBy${finder.name}(key: ${targetType}): ${resultType}`,
      `return $engine.findBy($domain, this.db, { ${property(finder.column)}: key }) as ${resultType};`,
    );
  });

const baseMethods = (name: string): string[] => {
  const isExistedType = result(`${name}ExistedId | $repository.NOT_EXIST`, '$repository.DbError');
  const getByIdType = result(name, '$repository.EntityNotFoundError | $repository.DbError');
  const writeType = (value: string): string =>
    result(value, '$repository.ConflictError | $repository.DbError');
  return [
    method(
      `isExisted(id: ${name}Id): ${isExistedType}`,
      `return $engine.isExisted($domain, this.db, id) as ${isExistedType};`,
    ),
    method(
      `getById(id: ${name}ExistedId): ${getByIdType}`,
      `return $engine.getById($domain, this.db, id) as ${getByIdType};`,
    ),
    method(
      `save(value: $repository.SaveInput<${name}, New${name}>): ${writeType(name)}`,
      `return $engine.save($domain, this.db, value) as ${writeType(name)};`,
    ),
    method(
      `delete(model: ${name}): ${writeType('void')}`,
      'return $engine.remove($domain, this.db, model);',
    ),
  ];
};

const domainDefinition = (
  domain: Domain,
  drizzleMajor: 0 | 1,
  ref: (exportName: string) => string,
): string[] => {
  const children = domain.children.map((child) => childDefinition(child, '    ', ref));
  const lockColumn = domain.columns.find((column) => column.kind === 'lock')?.key;
  return [
    `const $domain = $engine.defineDomain({`,
    `  name: ${quote(domain.typeName)},`,
    `  drizzleMajor: ${drizzleMajor},`,
    `  dialect: ${quote(domain.dialect)},`,
    `  queryKey: ${quote(domain.exportName)},`,
    `  table: ${ref(domain.exportName)},`,
    `  primaryKey: ${quote(domain.primaryKey)},`,
    `  columns: ${JSON.stringify(modelColumnsOf(domain))},`,
    `  excludedColumns: ${JSON.stringify(excludedOf(domain))},`,
    `  lockColumn: ${lockColumn === undefined ? 'undefined' : quote(lockColumn)},`,
    `  uniqueKeys: ${JSON.stringify(domain.uniqueKeys)},`,
    `  children: [${children.length === 0 ? '' : `\n${children.join(',\n')}\n  `}],`,
    `});`,
  ];
};

const imports = (
  domain: Domain,
  roots: Roots,
  paths: EmitPaths,
  schemaLines: readonly string[],
) => {
  const name = domain.typeName;
  const modelPath = (exportName: string): string =>
    `${paths.modelFromRepository}/${fileBaseName(exportName)}.model`;
  const finderTargets = [
    ...new Set(domain.finders.flatMap((finder) => roots.get(finder.target) ?? [])),
  ].filter((target) => target !== domain);
  return [
    `import { Injectable as $Injectable, inject as $inject } from "@zeltjs/core";`,
    `import type * as $repository from "@zeltjs/drizzle-repository";`,
    `import * as $engine from "@zeltjs/drizzle-repository/engine";`,
    `import type { ResultAsync as $ResultAsync } from "neverthrow";`,
    '',
    `import { ${paths.databaseName} as $Database } from ${quote(paths.databaseFromRepository)};`,
    ...schemaLines,
    `import type { ${name}, ${name}ExistedId, ${name}Id, New${name} } from ${quote(modelPath(domain.exportName))};`,
    ...finderTargets.map(
      (target) =>
        `import type { ${target.typeName}ExistedId } from ${quote(modelPath(target.exportName))};`,
    ),
  ];
};

export const emitRepository = (
  domain: Domain,
  drizzleMajor: 0 | 1,
  roots: Roots,
  paths: EmitPaths,
): string => {
  const tables = [domain, ...tablesOf(domain.children)];
  const schema = schemaImports(
    'import',
    tables.map((table) => table.exportName),
    paths.schemaFromRepository,
  );
  const row = `(typeof ${schema.ref(domain.exportName)}.$inferSelect)`;
  const [isExisted, getById, save, remove] = baseMethods(domain.typeName);
  const methods = [
    isExisted,
    getById,
    ...uniqueMethods(domain, row),
    ...finderMethods(domain, roots),
    save,
    remove,
  ];

  return [
    GENERATED_HEADER,
    ...imports(domain, roots, paths, schema.lines),
    '',
    ...domainDefinition(domain, drizzleMajor, schema.ref),
    '',
    `@$Injectable()`,
    `export class ${domain.typeName}RepositoryBase {`,
    `  private readonly db = $inject($Database);`,
    ...methods.flatMap((text) => ['', text ?? '']),
    `}`,
    '',
  ].join('\n');
};
