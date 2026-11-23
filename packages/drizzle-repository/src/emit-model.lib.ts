import type { Domain, DomainChild, DomainColumn } from './domain.lib';
import type { EmitPaths, Roots } from './emit-shared.lib';
import {
  excludedOf,
  fileBaseName,
  GENERATED_HEADER,
  property,
  quote,
  schemaImports,
  tablesOf,
  union,
} from './emit-shared.lib';

type Table = Domain | DomainChild;

type TablePlace = {
  readonly domain: Domain;
  readonly roots: Roots;
  readonly isRoot: boolean;
  readonly parentIsRoot: boolean;
};

const orNull = (type: string, nullable: boolean): string => (nullable ? `${type} | null` : type);

// Ids of a domain root take its id types. Inside its own domain the root is referenced by
// unconfirmed id, so that a new domain can be written together with its rows.
const referenceType = (
  column: Extract<DomainColumn, { kind: 'reference' }>,
  place: TablePlace,
): string | undefined => {
  const target = place.roots.get(column.root);
  if (target === undefined) return undefined;
  const ownRoot = !place.isRoot && target === place.domain;
  return orNull(`${target.typeName}${ownRoot ? 'Id' : 'ExistedId'}`, column.nullable);
};

const columnType = (column: DomainColumn, place: TablePlace): string | undefined => {
  if (column.kind === 'reference') return referenceType(column, place);
  if (column.kind === 'link' && place.parentIsRoot && column.parent === place.domain.primaryKey) {
    return orNull(`${place.domain.typeName}Id`, column.nullable);
  }
  return undefined;
};

const typedColumns = (table: Table, place: TablePlace): Map<string, string> =>
  new Map(
    table.columns.flatMap((column): [string, string][] => {
      const type = columnType(column, place);
      return type === undefined ? [] : [[column.key, type]];
    }),
  );

const rowTypeName = (table: Table): string => `$${table.exportName}Row`;

const objectType = (table: Table, extra: ReadonlyMap<string, string>): string => {
  // Relation names are not columns of the row, so only column keys are omitted.
  const columnKeys = new Set(table.columns.map((column) => column.key));
  const omit = [...new Set([...excludedOf(table), ...extra.keys()])].filter((key) =>
    columnKeys.has(key),
  );
  const base =
    omit.length === 0 ? rowTypeName(table) : `Omit<${rowTypeName(table)}, ${union(omit)}>`;
  if (extra.size === 0) return base;
  const fields = [...extra].map(([key, type]) => `  ${property(key)}: ${type};`).join('\n');
  return `${base} & {\n${fields}\n}`;
};

const childTypes = (
  children: readonly DomainChild[],
  domain: Domain,
  roots: Roots,
  parentIsRoot: boolean,
): string[] =>
  children.flatMap((child) => {
    const extra = typedColumns(child, { domain, roots, isRoot: false, parentIsRoot });
    for (const nested of child.children) extra.set(nested.relation, `${nested.typeName}[]`);
    return [
      ...childTypes(child.children, domain, roots, false),
      `export type ${child.typeName} = ${objectType(child, extra)};\n`,
    ];
  });

const foreignRootsOf = (domain: Domain, roots: Roots): Domain[] => [
  ...new Set(
    [domain, ...tablesOf(domain.children)]
      .flatMap((table) =>
        table.columns.flatMap((column) =>
          column.kind === 'reference' ? [roots.get(column.root)] : [],
        ),
      )
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
  const tables = [domain, ...tablesOf(domain.children)];
  const schema = schemaImports(
    'import type',
    tables.map((table) => table.exportName),
    paths.schemaFromModel,
  );

  const rootExtra = typedColumns(domain, { domain, roots, isRoot: true, parentIsRoot: false });
  rootExtra.set(domain.primaryKey, `${name}ExistedId`);
  for (const child of domain.children) rootExtra.set(child.relation, `${child.typeName}[]`);

  return [
    GENERATED_HEADER,
    `import type * as $repository from "@zeltjs/drizzle-repository";`,
    ...schema.lines,
    ...foreignRootsOf(domain, roots).map(
      (root) =>
        `import type { ${root.typeName}ExistedId } from ${quote(`./${fileBaseName(root.exportName)}.model`)};`,
    ),
    '',
    ...tables.map(
      (table) =>
        `type ${rowTypeName(table)} = typeof ${schema.ref(table.exportName)}.$inferSelect;`,
    ),
    '',
    `export type ${name}Id = ${rowTypeName(domain)}[${quote(domain.primaryKey)}];`,
    `export type ${name}ExistedId = $repository.Existed<${name}Id, ${quote(name)}>;`,
    '',
    ...childTypes(domain.children, domain, roots, true),
    `export type ${name} = ${objectType(domain, rootExtra)};`,
    '',
    `export type New${name} = Omit<${name}, ${quote(domain.primaryKey)}> & { ${property(domain.primaryKey)}: ${name}Id };`,
    '',
    ...stagingDeclaration(name),
    '',
  ].join('\n');
};
