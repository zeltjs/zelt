import type ts from 'typescript';

import { collectDeclarations } from './core-declarations.lib';
import type { CoreFacts, CoreResolver } from './core-facts.types';
import {
  createCoreIndex,
  exportedDeclarations,
  locationOf,
  ownerOf,
  targetFor,
} from './core-index.lib';
import { emitContainerRelations, visitWalkable } from './core-relations.lib';
import type { ResolvedConfig } from './extract-config.lib';

/**
 * Read TS facts (declarations, containment, call/read/type/contract lines and source spans)
 * out of one Program. Knows no framework.
 */
export const buildCoreFacts = (program: ts.Program, config: ResolvedConfig): CoreFacts => {
  const index = createCoreIndex(program, config);

  const appFiles = program
    .getSourceFiles()
    .filter((file) => !file.isDeclarationFile && config.isIncluded(index.rel(file.fileName)));

  // pass 1: declarations, pass 2: relations
  const pass = collectDeclarations(index, appFiles);
  for (const { node, owner } of pass.walkables) visitWalkable(index, node, owner);
  for (const { node, id } of pass.containers) emitContainerRelations(index, node, id);

  const inspectedFiles = appFiles.map((file) => index.rel(file.fileName)).sort();
  const resolver: CoreResolver = {
    facts: () => ({
      groups: [...index.groups.values()],
      declarations: [...index.declarations.values()],
      relations: [...index.relations.values()],
      inspectedFiles,
      resolver,
    }),
    subjectOf: (node) => targetFor(index, node)?.id ?? null,
    ownerOf: (node) => ownerOf(index, node),
    exportsOf: (specifier, names) => exportedDeclarations(index, specifier, names),
    spanOf: (node, start = node.getStart(), end = node.getEnd()) => ({
      ...locationOf(index, node, start, end),
      start,
      end,
    }),
    relativePath: index.rel,
  };
  return resolver.facts();
};
