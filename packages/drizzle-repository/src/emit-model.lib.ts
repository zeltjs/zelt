import type { Domain, DomainChild } from './domain.lib';
import type { EmitPaths, Roots } from './emit-shared.lib';
import {
  excludedOf,
  fileBaseName,
  GENERATED_HEADER,
  property,
  quote,
  rootOf,
  schemaImports,
  tablesOf,
  union,
} from './emit-shared.lib';
import type { SchemaForeignKey, SchemaTable } from './generation.types';

type ForeignTypes = {
  readonly ownRoot: string;
  readonly roots: Roots;
};

// Ids that point to a domain root take its id types; the own root is referenced by unconfirmed id
// so that a new domain can be written together with its rows.
const foreignColumnType = (
  table: SchemaTable,
  foreignKey: SchemaForeignKey,
  types: ForeignTypes,
  isRoot: boolean,
): readonly [string, string] | undefined => {
  const target = rootOf(foreignKey, types.roots);
  const [column] = foreignKey.columns;
  if (target === undefined || column === undefined) return undefined;
  const ownRootId = !isRoot && foreignKey.table === types.ownRoot;
  const typeName = ownRootId ? `${target.typeName}Id` : `${target.typeName}ExistedId`;
  const nullable = table.columns.find((candidate) => candidate.key === column)?.notNull === false;
  return [column, nullable ? `${typeName} | null` : typeName];
};

const foreignColumnTypes = (
  table: SchemaTable,
  types: ForeignTypes,
  isRoot: boolean,
): Map<string, string> =>
  new Map(
    table.foreignKeys.flatMap((foreignKey) => {
      const entry = foreignColumnType(table, foreignKey, types, isRoot);
      return entry === undefined ? [] : [entry];
    }),
  );

const rowTypeName = (table: SchemaTable): string => `$${table.exportName}Row`;

const objectType = (
  table: SchemaTable,
  omitted: readonly string[],
  extra: ReadonlyMap<string, string>,
): string => {
  // Relation names are not columns of the row, so only column keys are omitted.
  const columnKeys = new Set(table.columns.map((column) => column.key));
  const omit = [...new Set([...omitted, ...extra.keys()])].filter((key) => columnKeys.has(key));
  const base =
    omit.length === 0 ? rowTypeName(table) : `Omit<${rowTypeName(table)}, ${union(omit)}>`;
  if (extra.size === 0) return base;
  const fields = [...extra].map(([key, type]) => `  ${property(key)}: ${type};`).join('\n');
  return `${base} & {\n${fields}\n}`;
};

const childTypes = (children: readonly DomainChild[], types: ForeignTypes): string[] =>
  children.flatMap((child) => {
    const extra = foreignColumnTypes(child.table, types, false);
    for (const nested of child.children) extra.set(nested.relation, `${nested.typeName}[]`);
    return [
      ...childTypes(child.children, types),
      `export type ${child.typeName} = ${objectType(child.table, excludedOf(child.table), extra)};\n`,
    ];
  });

const foreignRootsOf = (domain: Domain, tables: readonly SchemaTable[], roots: Roots): Domain[] => [
  ...new Set(
    tables
      .flatMap((table) => table.foreignKeys.map((foreignKey) => rootOf(foreignKey, roots)))
      .flatMap((target) => (target === undefined || target === domain ? [] : [target])),
  ),
];

const stagingDeclaration = (name: string): readonly string[] => [
  `declare module "@zeltjs/drizzle-repository" {`,
  `  interface StagingModels {`,
  `    ${name}: { save: $repository.SaveInput<${name}, New${name}>; model: ${name} };`,
  `  }`,
  `}`,
];

export const emitModel = (
  domain: Domain,
  roots: Roots,
  paths: Pick<EmitPaths, 'schemaFromModel'>,
): string => {
  const name = domain.typeName;
  const types: ForeignTypes = { ownRoot: domain.root.exportName, roots };
  const tables = [domain.root, ...tablesOf(domain.children)];
  const schema = schemaImports(
    'import type',
    tables.map((table) => table.exportName),
    paths.schemaFromModel,
  );

  const rootExtra = foreignColumnTypes(domain.root, types, true);
  rootExtra.set(domain.primaryKey, `${name}ExistedId`);
  for (const child of domain.children) rootExtra.set(child.relation, `${child.typeName}[]`);

  return [
    GENERATED_HEADER,
    `import type * as $repository from "@zeltjs/drizzle-repository";`,
    ...schema.lines,
    ...foreignRootsOf(domain, tables, roots).map(
      (root) =>
        `import type { ${root.typeName}ExistedId } from ${quote(`./${fileBaseName(root.root.exportName)}.model`)};`,
    ),
    '',
    ...tables.map(
      (table) =>
        `type ${rowTypeName(table)} = typeof ${schema.ref(table.exportName)}.$inferSelect;`,
    ),
    '',
    `export type ${name}Id = ${rowTypeName(domain.root)}[${quote(domain.primaryKey)}];`,
    `export type ${name}ExistedId = $repository.Existed<${name}Id, ${quote(name)}>;`,
    '',
    ...childTypes(domain.children, types),
    `export type ${name} = ${objectType(domain.root, excludedOf(domain.root), rootExtra)};`,
    '',
    `export type New${name} = Omit<${name}, ${quote(domain.primaryKey)}> & { ${property(domain.primaryKey)}: ${name}Id };`,
    '',
    ...stagingDeclaration(name),
    '',
  ].join('\n');
};
