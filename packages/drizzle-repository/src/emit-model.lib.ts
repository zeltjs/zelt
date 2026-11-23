import { dirname } from 'node:path';

import type { Domain, DomainChild, DomainColumn } from './domain.lib';
import { excludedOf } from './domain.lib';
import type { EmitPaths } from './emit-shared.lib';
import {
  GENERATED_HEADER,
  property,
  quote,
  schemaImports,
  specifier,
  tablesOf,
  union,
} from './emit-shared.lib';
import type { ChildNames, DomainNames, Names } from './naming.lib';

type Table = Domain | DomainChild;

type TablePlace = {
  readonly own: DomainNames;
  readonly names: Names;
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
  const target = place.names.get(column.root);
  if (target === undefined) return undefined;
  const ownRoot = !place.isRoot && target === place.own;
  return orNull(ownRoot ? target.id : target.existedId, column.nullable);
};

const columnType = (column: DomainColumn, place: TablePlace): string | undefined => {
  if (column.kind === 'reference') return referenceType(column, place);
  if (
    column.kind === 'link' &&
    place.parentIsRoot &&
    column.parent === place.own.domain.primaryKey
  ) {
    return orNull(place.own.id, column.nullable);
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
  children: readonly ChildNames[],
  own: DomainNames,
  names: Names,
  parentIsRoot: boolean,
): string[] =>
  children.flatMap(({ child, type, children: nested }) => {
    const extra = typedColumns(child, { own, names, isRoot: false, parentIsRoot });
    for (const grandChild of nested) extra.set(grandChild.child.relation, `${grandChild.type}[]`);
    return [
      ...childTypes(nested, own, names, false),
      `export type ${type} = ${objectType(child, extra)};\n`,
    ];
  });

const foreignRootsOf = (own: DomainNames, names: Names): DomainNames[] => [
  ...new Set(
    [own.domain, ...tablesOf(own.domain.children)]
      .flatMap((table) =>
        table.columns.flatMap((column) =>
          column.kind === 'reference' ? [names.get(column.root)] : [],
        ),
      )
      .flatMap((target) => (target === undefined || target === own ? [] : [target])),
  ),
];

const stagingDeclaration = (own: DomainNames): readonly string[] => [
  `declare module "@zeltjs/drizzle-repository" {`,
  `  interface StagingModels {`,
  `    ${own.model}: { save: $repository.SaveInput<${own.model}, ${own.newModel}>; model: ${own.model} };`,
  `  }`,
  `}`,
];

export const emitModel = (
  own: DomainNames,
  names: Names,
  paths: Pick<EmitPaths, 'schemaFromModel'>,
): string => {
  const { domain, model } = own;
  const tables = [domain, ...tablesOf(domain.children)];
  const schema = schemaImports(
    'import type',
    tables.map((table) => table.exportName),
    paths.schemaFromModel,
  );

  const rootExtra = typedColumns(domain, { own, names, isRoot: true, parentIsRoot: false });
  rootExtra.set(domain.primaryKey, own.existedId);
  for (const { child, type } of own.children) rootExtra.set(child.relation, `${type}[]`);

  return [
    GENERATED_HEADER,
    `import type * as $repository from "@zeltjs/drizzle-repository";`,
    ...schema.lines,
    ...foreignRootsOf(own, names).map(
      (root) =>
        `import type { ${root.existedId} } from ${quote(specifier(dirname(own.modelFile), root.modelFile))};`,
    ),
    '',
    ...tables.map(
      (table) =>
        `type ${rowTypeName(table)} = typeof ${schema.ref(table.exportName)}.$inferSelect;`,
    ),
    '',
    `export type ${own.id} = ${rowTypeName(domain)}[${quote(domain.primaryKey)}];`,
    `export type ${own.existedId} = $repository.Existed<${own.id}, ${quote(model)}>;`,
    '',
    ...childTypes(own.children, own, names, true),
    `export type ${model} = ${objectType(domain, rootExtra)};`,
    '',
    `export type ${own.newModel} = Omit<${model}, ${quote(domain.primaryKey)}> & { ${property(domain.primaryKey)}: ${own.id} };`,
    '',
    ...stagingDeclaration(own),
    '',
  ].join('\n');
};
