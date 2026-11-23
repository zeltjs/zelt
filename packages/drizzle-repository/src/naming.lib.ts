import { relative, resolve } from 'node:path';

import type { Result } from 'neverthrow';
import { err, ok } from 'neverthrow';

import type { Domain, DomainChild } from './domain.lib';
import type { GenerationError } from './generation.types';

export type ChildNames = {
  readonly child: DomainChild;
  readonly type: string;
  readonly children: readonly ChildNames[];
};

export type UniqueKeyNames = {
  readonly columns: readonly string[];
  // Names the key for the engine and for staging.
  readonly key: string;
  readonly method: string;
};

export type FinderNames = {
  readonly column: string;
  readonly root: string;
  readonly method: string;
};

export type DomainNames = {
  readonly domain: Domain;
  readonly model: string;
  readonly id: string;
  readonly existedId: string;
  readonly newModel: string;
  readonly repository: string;
  readonly modelFile: string;
  readonly repositoryFile: string;
  readonly children: readonly ChildNames[];
  readonly uniqueKeys: readonly UniqueKeyNames[];
  readonly finders: readonly FinderNames[];
};

// Export name of each domain root -> the names of its domain.
export type Names = ReadonlyMap<string, DomainNames>;

export const MODEL_SUFFIX = '.model.ts';
export const REPOSITORY_SUFFIX = '.repository-base.ts';

export type OutputDirectories = {
  readonly cwd: string;
  readonly model: string;
  readonly repository: string;
};

// Every character that cannot be in an identifier separates words, so a column key always makes a method name.
const upperCamel = (name: string): string =>
  name
    .split(/[^A-Za-z0-9$]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const keyName = (columns: readonly string[]): string => columns.map(upperCamel).join('And');

const fileBaseName = (exportName: string): string =>
  exportName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();

const childNamesOf = (children: readonly DomainChild[]): ChildNames[] =>
  children.map((child) => ({
    child,
    type: upperCamel(child.exportName),
    children: childNamesOf(child.children),
  }));

const namesOf = (domain: Domain, directories: OutputDirectories): DomainNames => {
  const model = upperCamel(domain.exportName);
  const base = fileBaseName(domain.exportName);
  return {
    domain,
    model,
    id: `${model}Id`,
    existedId: `${model}ExistedId`,
    newModel: `New${model}`,
    repository: `${model}RepositoryBase`,
    modelFile: resolve(directories.model, `${base}${MODEL_SUFFIX}`),
    repositoryFile: resolve(directories.repository, `${base}${REPOSITORY_SUFFIX}`),
    children: childNamesOf(domain.children),
    uniqueKeys: domain.uniqueKeys.map((columns) => ({
      columns,
      key: keyName(columns),
      method: `isExistedBy${keyName(columns)}`,
    })),
    finders: domain.finders.map((finder) => ({
      ...finder,
      method: `findBy${keyName([finder.column])}`,
    })),
  };
};

// A name that a part of the schema makes in one scope of the generated code.
type Claim = {
  readonly scope: string;
  readonly name: string;
  readonly source: string;
  // What two names of the scope are compared by, when it is not the name itself.
  readonly sameAs?: string;
};

const flatten = (children: readonly ChildNames[]): ChildNames[] =>
  children.flatMap((names) => [names, ...flatten(names.children)]);

const identifierClaims = ({ domain, ...names }: DomainNames): Claim[] => [
  ...[names.model, names.id, names.existedId, names.newModel, names.repository].map((name) => ({
    scope: 'identifier',
    name,
    source: domain.exportName,
  })),
  ...flatten(names.children).map(({ child, type }) => ({
    scope: 'identifier',
    name: type,
    source: child.exportName,
  })),
];

// File systems that ignore case store two paths that differ only in case as one file.
const fileClaims = ({ domain, ...names }: DomainNames, cwd: string): Claim[] =>
  [names.modelFile, names.repositoryFile].map((path) => ({
    scope: 'file',
    name: relative(cwd, path),
    source: domain.exportName,
    sameAs: path.toLowerCase(),
  }));

const methodClaims = ({ domain, ...names }: DomainNames): Claim[] => {
  const scope = `methods of ${names.repository}`;
  return [
    ...names.uniqueKeys.map((key) => ({
      scope,
      name: key.method,
      source: `${domain.exportName}(${key.columns.join(', ')})`,
    })),
    ...names.finders.map((finder) => ({
      scope,
      name: finder.method,
      source: `${domain.exportName}.${finder.column}`,
    })),
  ];
};

// isExistedBy<key> returns { id: NOT_EXIST, ...key } when no row has the key.
const resultClaims = ({ domain, ...names }: DomainNames): Claim[] =>
  names.uniqueKeys.flatMap((key) => {
    const scope = `result of ${domain.exportName}(${key.columns.join(', ')})`;
    return [
      { scope, name: 'id', source: `the result of ${key.method}` },
      ...key.columns.map((column) => ({
        scope,
        name: column,
        source: `${domain.exportName}.${column}`,
      })),
    ];
  });

// A relation is a property of the model next to the columns of its table.
const propertyClaims = ({ domain, ...names }: DomainNames): Claim[] =>
  [domain, ...flatten(names.children).map(({ child }) => child)].flatMap((table) => {
    const scope = `properties of ${table.exportName}`;
    const source = (key: string): string => `${table.exportName}.${key}`;
    return [
      ...table.columns.flatMap((column) =>
        column.kind === 'excluded' ? [] : [{ scope, name: column.key, source: source(column.key) }],
      ),
      ...table.children.map((child) => ({
        scope,
        name: child.relation,
        source: `the relation ${source(child.relation)}`,
      })),
    ];
  });

const collisionsOf = (claims: readonly Claim[]): GenerationError[] => {
  const owners = new Map<string, Claim>();
  // The sources of two claims -> every name both make.
  const collisions = new Map<string, string[]>();
  for (const claim of claims) {
    const key = `${claim.scope}\u0000${claim.sameAs ?? claim.name}`;
    const owner = owners.get(key);
    if (owner === undefined) {
      owners.set(key, claim);
      continue;
    }
    const sources = `${owner.source} and ${claim.source}`;
    collisions.set(sources, [...(collisions.get(sources) ?? []), claim.name]);
  }
  return [...collisions].map(([sources, names]) => ({
    message: `${sources}: both make ${names.join(', ')}`,
  }));
};

// The generated code keeps names starting with $ for its own imports and row types. The names
// made from a valid type name by adding words are valid too.
const undeclarable = (named: readonly DomainNames[]): GenerationError[] =>
  named
    .flatMap((names) => [
      { source: names.domain.exportName, name: names.model },
      ...flatten(names.children).map(({ child, type }) => ({
        source: child.exportName,
        name: type,
      })),
    ])
    .filter(({ name }) => !/^[A-Za-z][A-Za-z0-9$]*$/.test(name))
    .map(({ source, name }) => ({
      message: `${source}: makes the type name ${JSON.stringify(name)}, which the generated code cannot declare. Export it under a name that starts with a letter`,
    }));

// The one place that decides the names, files and methods of the generated code, so that no two
// parts of the schema end up with the same one.
export const nameDomains = (
  domains: readonly Domain[],
  directories: OutputDirectories,
): Result<Names, readonly GenerationError[]> => {
  const named = domains.map((domain) => namesOf(domain, directories));
  const claims = named.flatMap((names) => [
    ...identifierClaims(names),
    ...fileClaims(names, directories.cwd),
    ...methodClaims(names),
    ...resultClaims(names),
    ...propertyClaims(names),
  ]);
  const errors = [...undeclarable(named), ...collisionsOf(claims)];
  return errors.length > 0
    ? err(errors)
    : ok(new Map(named.map((names) => [names.domain.exportName, names])));
};
