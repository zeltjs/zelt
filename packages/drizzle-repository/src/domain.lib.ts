import type { Result } from 'neverthrow';
import { err, ok } from 'neverthrow';

import type {
  GenerationError,
  Schema,
  SchemaColumn,
  SchemaRelation,
  SchemaTable,
} from './generation.types';

// Columns of a child row that hold the values of the parent columns at the same positions.
type DomainForeignKey = {
  readonly columns: readonly string[];
  readonly parentColumns: readonly string[];
};

export type DomainChild = {
  readonly relation: string;
  readonly table: SchemaTable;
  readonly foreignKey: DomainForeignKey;
  readonly typeName: string;
  readonly primaryKey: string;
  readonly children: readonly DomainChild[];
};

type DomainKey = {
  readonly name: string;
  readonly columns: readonly string[];
};

type DomainFinder = {
  readonly name: string;
  readonly column: string;
  readonly target: string;
};

export type Domain = {
  readonly typeName: string;
  readonly root: SchemaTable;
  readonly primaryKey: string;
  readonly lockColumn: string | undefined;
  readonly uniqueKeys: readonly DomainKey[];
  readonly finders: readonly DomainFinder[];
  readonly children: readonly DomainChild[];
};

// Every character that cannot be in an identifier separates words, so a column key always makes a method name.
export const upperCamel = (name: string): string =>
  name
    .split(/[^A-Za-z0-9$]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const keyName = (columns: readonly string[]): string => columns.map(upperCamel).join('And');

const sameColumns = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((column) => b.includes(column));

const columnByKey = (table: SchemaTable, key: string): SchemaColumn | undefined =>
  table.columns.find((column) => column.key === key);

const lockErrors = (table: SchemaTable, isRoot: boolean): GenerationError[] => {
  const locks = table.columns.filter((column) => column.optimisticLock);
  const errors: GenerationError[] = locks
    .filter((column) => !column.isNumber)
    .map((column) => ({
      message: `${table.exportName}.${column.key}: optimisticLock is only for a number column`,
    }));
  // A NULL lock value never matches the condition of the update, so every write would conflict.
  for (const column of locks.filter((candidate) => !candidate.notNull)) {
    errors.push({
      message: `${table.exportName}.${column.key}: optimisticLock is only for a NOT NULL column`,
    });
  }
  if (locks.length > 1) {
    errors.push({ message: `${table.exportName}: optimisticLock is on more than one column` });
  }
  if (locks.length > 0 && !isRoot) {
    errors.push({
      message: `${table.exportName}: optimisticLock is on a table that is not the root of a domain`,
    });
  }
  return errors;
};

const singlePrimaryKey = (table: SchemaTable): Result<string, GenerationError> => {
  const [first, ...rest] = table.primaryKey;
  if (first === undefined || rest.length > 0) {
    return err({
      message: `${table.exportName}: a table in a domain needs a single-column primary key`,
    });
  }
  return ok(first);
};

// The engine writes the parent's values into these columns, so the parent's model must carry them.
const foreignKeyOf = (
  relation: SchemaRelation,
  parent: SchemaTable,
): Result<DomainForeignKey, GenerationError> => {
  const { sourceColumns, targetColumns } = relation;
  const label = `${relation.source}.${relation.name}`;
  if (sourceColumns.length === 0 || sourceColumns.length !== targetColumns.length) {
    return err({
      message: `${label}: cannot tell which columns of ${relation.target} point to ${relation.source}`,
    });
  }
  const excluded = sourceColumns.filter(
    (key) => columnByKey(parent, key)?.excludedFromModel === true,
  );
  if (excluded.length > 0) {
    return err({
      message: `${label}: the relation uses ${excluded.join(', ')}, which is excluded from the model`,
    });
  }
  return ok({ columns: targetColumns, parentColumns: sourceColumns });
};

const cycleError = (members: readonly string[]): GenerationError => ({
  message: `${[...members].sort().join(', ')}: includedInDomain forms a cycle`,
});

// Follows includedInDomain upward from a table that no root reached: either the chain loops,
// or it ends at a table that cannot be a root.
const unreachedError = (
  start: string,
  parentOf: ReadonlyMap<string, string>,
  tableByName: ReadonlyMap<string, SchemaTable>,
): GenerationError | undefined => {
  const chain: string[] = [];
  let current = start;
  for (let parent = parentOf.get(current); parent !== undefined; parent = parentOf.get(current)) {
    if (chain.includes(current)) return cycleError(chain.slice(chain.indexOf(current)));
    chain.push(current);
    current = parent;
  }
  const top = tableByName.get(current);
  return top === undefined
    ? undefined
    : singlePrimaryKey(top).match(
        () => undefined,
        (error) => error,
      );
};

type Context = {
  readonly tableByName: ReadonlyMap<string, SchemaTable>;
  readonly included: readonly SchemaRelation[];
  readonly rootNames: ReadonlySet<string>;
  readonly reached: Set<string>;
  readonly errors: GenerationError[];
};

const childKeys = (
  table: SchemaTable,
  relation: SchemaRelation,
  parent: SchemaTable,
): Result<readonly [string, DomainForeignKey], GenerationError[]> => {
  const primaryKey = singlePrimaryKey(table);
  const foreignKey = foreignKeyOf(relation, parent);
  if (primaryKey.isOk() && foreignKey.isOk()) return ok([primaryKey.value, foreignKey.value]);
  return err([primaryKey, foreignKey].flatMap((result) => (result.isErr() ? [result.error] : [])));
};

const childOf = (
  context: Context,
  source: string,
  relation: SchemaRelation,
  path: readonly string[],
): DomainChild[] => {
  if (path.includes(relation.target)) {
    context.errors.push(cycleError(path.slice(path.indexOf(relation.target))));
    return [];
  }
  const table = context.tableByName.get(relation.target);
  const parent = context.tableByName.get(source);
  if (table === undefined || parent === undefined) return [];
  context.reached.add(table.exportName);
  const keys = childKeys(table, relation, parent);
  if (keys.isErr()) {
    context.errors.push(...keys.error);
    return [];
  }
  const [primaryKey, foreignKey] = keys.value;
  return [
    {
      relation: relation.name,
      table,
      foreignKey,
      typeName: upperCamel(table.exportName),
      primaryKey,
      children: childrenOf(context, table.exportName, [...path, table.exportName]),
    },
  ];
};

const childrenOf = (context: Context, source: string, path: readonly string[]): DomainChild[] =>
  context.included
    .filter((relation) => relation.source === source)
    .flatMap((relation) => childOf(context, source, relation, path));

// A key with a NULL-able column cannot identify a row, so no method is made from it.
const uniqueKeysOf = (root: SchemaTable, primaryKey: string): DomainKey[] =>
  root.uniqueKeys
    .filter((columns) => !sameColumns(columns, [primaryKey]))
    .filter((columns) => columns.every((key) => columnByKey(root, key)?.notNull === true))
    .filter(
      (columns, index, all) => all.findIndex((other) => sameColumns(other, columns)) === index,
    )
    .map((columns): DomainKey => ({ name: keyName(columns), columns }));

const findersOf = (
  context: Context,
  root: SchemaTable,
  uniqueKeys: readonly DomainKey[],
): DomainFinder[] =>
  root.foreignKeys.flatMap((foreignKey): DomainFinder[] => {
    const [column, ...rest] = foreignKey.columns;
    const target = context.tableByName.get(foreignKey.table);
    if (column === undefined || rest.length > 0 || !context.rootNames.has(foreignKey.table)) {
      return [];
    }
    if (target === undefined || !sameColumns(foreignKey.foreignColumns, target.primaryKey)) {
      return [];
    }
    if (uniqueKeys.some((key) => sameColumns(key.columns, foreignKey.columns))) return [];
    return [{ name: keyName(foreignKey.columns), column, target: foreignKey.table }];
  });

const domainOf = (context: Context, root: SchemaTable): Domain[] => {
  const primaryKeyResult = singlePrimaryKey(root);
  if (primaryKeyResult.isErr()) {
    context.errors.push(primaryKeyResult.error);
    return [];
  }
  const primaryKey = primaryKeyResult.value;
  const uniqueKeys = uniqueKeysOf(root, primaryKey);
  return [
    {
      typeName: upperCamel(root.exportName),
      root,
      primaryKey,
      lockColumn: root.columns.find((column) => column.optimisticLock)?.key,
      uniqueKeys,
      finders: findersOf(context, root, uniqueKeys),
      children: childrenOf(context, root.exportName, [root.exportName]),
    },
  ];
};

const parentCountErrors = (included: readonly SchemaRelation[]): GenerationError[] => {
  const parentsOf = new Map<string, number>();
  for (const relation of included) {
    parentsOf.set(relation.target, (parentsOf.get(relation.target) ?? 0) + 1);
  }
  return [...parentsOf]
    .filter(([, count]) => count > 1)
    .map(([target, count]) => ({
      message: `${target}: includedInDomain points to it from ${count} tables`,
    }));
};

export const buildDomains = (
  schema: Schema,
): Result<readonly Domain[], readonly GenerationError[]> => {
  const included = schema.relations.filter((relation) => relation.includedInDomain);
  const targets = new Set(included.map((relation) => relation.target));
  // A table keyed by several columns (such as the link table of a many-to-many relation) is left out
  // unless includedInDomain puts it into a domain, which then fails because a row needs a single id.
  const rootNames = new Set(
    schema.tables
      .filter((table) => !targets.has(table.exportName) && singlePrimaryKey(table).isOk())
      .map((table) => table.exportName),
  );
  const context: Context = {
    tableByName: new Map(schema.tables.map((table) => [table.exportName, table])),
    included,
    rootNames,
    reached: new Set(),
    errors: [
      ...parentCountErrors(included),
      ...included
        .filter((candidate) => !candidate.many)
        .map((relation) => ({
          message: `${relation.source}.${relation.name}: includedInDomain is only for a many relation`,
        })),
      ...schema.tables.flatMap((table) => lockErrors(table, rootNames.has(table.exportName))),
    ],
  };

  const domains = schema.tables
    .filter((table) => rootNames.has(table.exportName))
    .flatMap((root) => domainOf(context, root));

  const parentOf = new Map(included.map((relation) => [relation.target, relation.source]));
  for (const target of parentOf.keys()) {
    if (context.reached.has(target)) continue;
    const error = unreachedError(target, parentOf, context.tableByName);
    if (error !== undefined) context.errors.push(error);
  }

  const messages = [...new Set(context.errors.map((error) => error.message))];
  return messages.length > 0 ? err(messages.map((message) => ({ message }))) : ok(domains);
};
