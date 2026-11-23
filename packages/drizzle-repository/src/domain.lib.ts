import { err, ok, Result } from 'neverthrow';

import type { Dialect } from './domain-definition.types';
import type {
  GenerationError,
  Schema,
  SchemaColumn,
  SchemaRelation,
  SchemaTable,
} from './generation.types';

// The one part a column plays in its domain. The classifiers below report a primary key that is
// excluded or the lock, a lock that is excluded, and a lock on a table that is not a root.
export type DomainColumn =
  | { kind: 'id' | 'value' | 'excluded' | 'lock'; readonly key: string }
  // Holds the id of the root of a domain.
  | {
      kind: 'reference';
      readonly key: string;
      readonly root: string;
      readonly nullable: boolean;
    }
  // Holds the value of the parent column of an included row; the engine writes it.
  | {
      kind: 'link';
      readonly key: string;
      readonly parent: string;
      readonly nullable: boolean;
    };

export type ChildColumn = Exclude<DomainColumn, { kind: 'lock' }>;

// A column of a child row and the parent column whose value it holds.
type LinkPair = { readonly column: string; readonly parent: string };

export type DomainChild = {
  readonly relation: string;
  readonly exportName: string;
  readonly typeName: string;
  readonly primaryKey: string;
  readonly columns: readonly ChildColumn[];
  readonly link: readonly LinkPair[];
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
  readonly exportName: string;
  readonly dialect: Dialect;
  readonly primaryKey: string;
  readonly columns: readonly DomainColumn[];
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

const failures = (messages: readonly (string | false)[]): GenerationError[] =>
  messages.flatMap((message) => (message === false ? [] : [{ message }]));

// What a table's place in the domain tells about its columns.
type Place = {
  readonly table: SchemaTable;
  readonly primaryKey: string;
  // Column -> the parent column whose value the engine writes into it.
  readonly links: ReadonlyMap<string, string>;
  // Column -> the domain root whose primary key it points to.
  readonly references: ReadonlyMap<string, string>;
};

const notRootLock = (table: SchemaTable): string =>
  `${table.exportName}: optimisticLock is on a table that is not the root of a domain`;

const classifyLock = (
  column: SchemaColumn,
  at: string,
): Result<DomainColumn, GenerationError[]> => {
  const errors = failures([
    column.excludedFromModel && `${at}: optimisticLock is not for a column excluded from the model`,
    !column.isNumber && `${at}: optimisticLock is only for a number column`,
    // A NULL lock value never matches the condition of the update, so every write would conflict.
    !column.notNull && `${at}: optimisticLock is only for a NOT NULL column`,
  ]);
  return errors.length > 0 ? err(errors) : ok({ kind: 'lock', key: column.key });
};

const classifyPrimaryKey = (
  column: SchemaColumn,
  at: string,
): Result<ChildColumn, GenerationError[]> => {
  const errors = failures([
    column.excludedFromModel && `${at}: excludedFromModel is not for the primary key`,
    column.optimisticLock && `${at}: optimisticLock is not for the primary key`,
  ]);
  return errors.length > 0 ? err(errors) : ok({ kind: 'id', key: column.key });
};

// Decides every part but the lock, which only the root of a domain may have.
const classifyUnlocked = (
  column: SchemaColumn,
  place: Place,
): Result<ChildColumn, GenerationError[]> => {
  const { key } = column;
  if (key === place.primaryKey) {
    return classifyPrimaryKey(column, `${place.table.exportName}.${key}`);
  }
  if (column.excludedFromModel) return ok({ kind: 'excluded', key });
  const nullable = !column.notNull;
  const parent = place.links.get(key);
  if (parent !== undefined) return ok({ kind: 'link', key, parent, nullable });
  const root = place.references.get(key);
  if (root !== undefined) return ok({ kind: 'reference', key, root, nullable });
  return ok({ kind: 'value', key });
};

const classifyRootColumns = (place: Place): Result<DomainColumn[], GenerationError[]> => {
  const { table } = place;
  const columns = Result.combineWithAllErrors(
    table.columns.map((column) =>
      column.optimisticLock && column.key !== place.primaryKey
        ? classifyLock(column, `${table.exportName}.${column.key}`)
        : classifyUnlocked(column, place),
    ),
  ).mapErr((errors) => errors.flat());
  const locks = table.columns.filter((column) => column.optimisticLock);
  if (locks.length <= 1) return columns;
  return err([
    ...(columns.isErr() ? columns.error : []),
    { message: `${table.exportName}: optimisticLock is on more than one column` },
  ]);
};

const classifyChildColumns = (place: Place): Result<ChildColumn[], GenerationError[]> =>
  Result.combineWithAllErrors(
    place.table.columns.map((column) =>
      column.optimisticLock
        ? err([{ message: notRootLock(place.table) }])
        : classifyUnlocked(column, place),
    ),
  ).mapErr((errors) => errors.flat());

const singlePrimaryKey = (table: SchemaTable): Result<string, GenerationError> => {
  const [first, ...rest] = table.primaryKey;
  if (first === undefined || rest.length > 0) {
    return err({
      message: `${table.exportName}: a table in a domain needs a single-column primary key`,
    });
  }
  return ok(first);
};

// A foreign key holds the id of a domain only when it points to the primary key of its root.
const referencesOf = (
  table: SchemaTable,
  rootByName: ReadonlyMap<string, SchemaTable>,
): ReadonlyMap<string, string> =>
  new Map(
    table.foreignKeys.flatMap((foreignKey): [string, string][] => {
      const [column, ...rest] = foreignKey.columns;
      const target = rootByName.get(foreignKey.table);
      if (column === undefined || rest.length > 0 || target === undefined) return [];
      return sameColumns(foreignKey.foreignColumns, target.primaryKey)
        ? [[column, foreignKey.table]]
        : [];
    }),
  );

// The engine writes the parent's values into the link columns, so the parent's model must carry them.
const linkOf = (
  relation: SchemaRelation,
  parentColumns: readonly DomainColumn[],
): Result<readonly LinkPair[], GenerationError> => {
  const { sourceColumns, targetColumns } = relation;
  const label = `${relation.source}.${relation.name}`;
  if (sourceColumns.length === 0 || sourceColumns.length !== targetColumns.length) {
    return err({
      message: `${label}: cannot tell which columns of ${relation.target} point to ${relation.source}`,
    });
  }
  const excluded = sourceColumns.filter(
    (key) => parentColumns.find((column) => column.key === key)?.kind === 'excluded',
  );
  if (excluded.length > 0) {
    return err({
      message: `${label}: the relation uses ${excluded.join(', ')}, which is excluded from the model`,
    });
  }
  return ok(
    targetColumns.flatMap((column, index) => {
      const parent = sourceColumns[index];
      return parent === undefined ? [] : [{ column, parent }];
    }),
  );
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
  readonly rootByName: ReadonlyMap<string, SchemaTable>;
  readonly included: readonly SchemaRelation[];
  readonly reached: Set<string>;
  readonly errors: GenerationError[];
};

const valueOrReport = <T>(
  context: Context,
  result: Result<T, GenerationError[]>,
): T | undefined => {
  if (result.isOk()) return result.value;
  context.errors.push(...result.error);
  return undefined;
};

const childOf = (
  context: Context,
  parentColumns: readonly DomainColumn[],
  relation: SchemaRelation,
  path: readonly string[],
): DomainChild[] => {
  if (path.includes(relation.target)) {
    context.errors.push(cycleError(path.slice(path.indexOf(relation.target))));
    return [];
  }
  const table = context.tableByName.get(relation.target);
  if (table === undefined) return [];
  context.reached.add(table.exportName);
  const keys = valueOrReport(
    context,
    Result.combineWithAllErrors([singlePrimaryKey(table), linkOf(relation, parentColumns)]),
  );
  if (keys === undefined) return [];
  const [primaryKey, link] = keys;
  const columns = valueOrReport(
    context,
    classifyChildColumns({
      table,
      primaryKey,
      links: new Map(link.map(({ column, parent }) => [column, parent])),
      references: referencesOf(table, context.rootByName),
    }),
  );
  if (columns === undefined) return [];
  return [
    {
      relation: relation.name,
      exportName: table.exportName,
      typeName: upperCamel(table.exportName),
      primaryKey,
      columns,
      link,
      children: childrenOf(context, table.exportName, columns, [...path, table.exportName]),
    },
  ];
};

const childrenOf = (
  context: Context,
  source: string,
  columns: readonly DomainColumn[],
  path: readonly string[],
): DomainChild[] =>
  context.included
    .filter((relation) => relation.source === source)
    .flatMap((relation) => childOf(context, columns, relation, path));

// A key with a NULL-able column cannot identify a row, so no method is made from it.
const uniqueKeysOf = (root: SchemaTable, primaryKey: string): DomainKey[] =>
  root.uniqueKeys
    .filter((columns) => !sameColumns(columns, [primaryKey]))
    .filter((columns) => columns.every((key) => columnByKey(root, key)?.notNull === true))
    .filter(
      (columns, index, all) => all.findIndex((other) => sameColumns(other, columns)) === index,
    )
    .map((columns): DomainKey => ({ name: keyName(columns), columns }));

// A reference that is also a unique key is read through the unique key.
const findersOf = (
  columns: readonly DomainColumn[],
  uniqueKeys: readonly DomainKey[],
): DomainFinder[] =>
  columns.flatMap((column): DomainFinder[] =>
    column.kind === 'reference' && !uniqueKeys.some((key) => sameColumns(key.columns, [column.key]))
      ? [{ name: keyName([column.key]), column: column.key, target: column.root }]
      : [],
  );

const domainOf = (context: Context, root: SchemaTable, primaryKey: string): Domain[] => {
  const columns = valueOrReport(
    context,
    classifyRootColumns({
      table: root,
      primaryKey,
      links: new Map(),
      references: referencesOf(root, context.rootByName),
    }),
  );
  if (columns === undefined) return [];
  const uniqueKeys = uniqueKeysOf(root, primaryKey);
  return [
    {
      typeName: upperCamel(root.exportName),
      exportName: root.exportName,
      dialect: root.dialect,
      primaryKey,
      columns,
      uniqueKeys,
      finders: findersOf(columns, uniqueKeys),
      children: childrenOf(context, root.exportName, columns, [root.exportName]),
    },
  ];
};

const unreachedErrors = (context: Context): GenerationError[] => {
  const parentOf = new Map(context.included.map((relation) => [relation.target, relation.source]));
  return [...parentOf.keys()].flatMap((target) => {
    if (context.reached.has(target)) return [];
    return unreachedError(target, parentOf, context.tableByName) ?? [];
  });
};

// A table in no domain is never written, so a lock on it would protect nothing.
const outsideLockErrors = (context: Context, tables: readonly SchemaTable[]): GenerationError[] =>
  tables
    .filter(
      (table) =>
        !context.rootByName.has(table.exportName) &&
        !context.reached.has(table.exportName) &&
        table.columns.some((column) => column.optimisticLock),
    )
    .map((table) => ({ message: notRootLock(table) }));

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
  const roots = schema.tables.flatMap((table): [SchemaTable, string][] => {
    const primaryKey = singlePrimaryKey(table);
    return !targets.has(table.exportName) && primaryKey.isOk() ? [[table, primaryKey.value]] : [];
  });
  const context: Context = {
    tableByName: new Map(schema.tables.map((table) => [table.exportName, table])),
    rootByName: new Map(roots.map(([table]) => [table.exportName, table])),
    included,
    reached: new Set(),
    errors: [
      ...parentCountErrors(included),
      ...included
        .filter((candidate) => !candidate.many)
        .map((relation) => ({
          message: `${relation.source}.${relation.name}: includedInDomain is only for a many relation`,
        })),
    ],
  };

  const domains = roots.flatMap(([root, primaryKey]) => domainOf(context, root, primaryKey));

  context.errors.push(...unreachedErrors(context), ...outsideLockErrors(context, schema.tables));

  const messages = [...new Set(context.errors.map((error) => error.message))];
  return messages.length > 0 ? err(messages.map((message) => ({ message }))) : ok(domains);
};
