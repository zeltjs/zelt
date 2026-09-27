import { resolve } from 'node:path';

import ts from 'typescript';

import type {
  CoreDeclarationSite,
  CoreSetupSite,
  CoreSourceSite,
  ExportRef,
} from './core-facts.types';
import type { CoreIndex } from './core-index.lib';
import { locationOf, targetFor } from './core-index.lib';
import { asSignature, firstLine, memberNameOf } from './source-text.lib';

/**
 * 所在と原文の引き口。plugin は runtime から `{filePath, exportName}` と行しか
 * 受け取らないので、索引の宣言・原文への変換はここに集約する(付録D)。
 */

const siteOf = (index: CoreIndex, node: ts.Node, start: number, end: number): CoreSourceSite => ({
  span: { ...locationOf(index, node, start, end), start, end },
  text: firstLine(node.getSourceFile().text.slice(start, end)),
});

const wholeSite = (index: CoreIndex, node: ts.Node): CoreSourceSite =>
  siteOf(index, node, node.getStart(), node.getEnd());

const sourceFileOf = (index: CoreIndex, filePath: string): ts.SourceFile | undefined => {
  const fileName = resolve(index.config.root, filePath);
  return index.program.getSourceFile(fileName);
};

const exportedSymbolOf = (
  index: CoreIndex,
  file: ts.SourceFile,
  exportName: string,
): ts.Symbol | undefined => {
  const moduleSymbol = index.checker.getSymbolAtLocation(file);
  if (moduleSymbol === undefined) return undefined;
  for (const symbol of index.checker.getExportsOfModule(moduleSymbol)) {
    if (symbol.name !== exportName) continue;
    return (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? index.checker.getAliasedSymbol(symbol)
      : symbol;
  }
  return undefined;
};

const exportedDeclarationOf = (index: CoreIndex, ref: ExportRef): ts.Declaration | undefined => {
  const file = sourceFileOf(index, ref.filePath);
  if (file === undefined) return undefined;
  const declarations = exportedSymbolOf(index, file, ref.exportName)?.declarations ?? [];
  // 同名の型宣言と値宣言が並ぶことがあるので、地図に載る値の宣言を先に選ぶ
  return (
    declarations.find(
      (declaration) =>
        ts.isClassDeclaration(declaration) ||
        ts.isFunctionDeclaration(declaration) ||
        ts.isVariableDeclaration(declaration),
    ) ?? declarations[0]
  );
};

const declarationSiteOf = (index: CoreIndex, node: ts.Declaration): CoreDeclarationSite => {
  const name = ts.getNameOfDeclaration(node);
  return { id: targetFor(index, node)?.id ?? null, ...wholeSite(index, name ?? node) };
};

export const exportSite = (index: CoreIndex, ref: ExportRef): CoreDeclarationSite | null => {
  const declaration = exportedDeclarationOf(index, ref);
  return declaration === undefined ? null : declarationSiteOf(index, declaration);
};

export const memberSite = (
  index: CoreIndex,
  ref: ExportRef,
  member: string,
): CoreDeclarationSite | null => {
  const declaration = exportedDeclarationOf(index, ref);
  if (declaration === undefined || !ts.isClassDeclaration(declaration)) return null;
  const found = declaration.members.find((candidate) => memberNameOf(candidate) === member);
  return found === undefined ? null : declarationSiteOf(index, found);
};

const decoratorSites = (index: CoreIndex, node: ts.Node): CoreSetupSite[] =>
  (ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : []).map((decorator) => ({
    kind: 'decorator' as const,
    ...wholeSite(index, decorator),
  }));

const heritageSites = (index: CoreIndex, node: ts.Node): CoreSetupSite[] =>
  (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)
    ? (node.heritageClauses ?? [])
    : []
  ).map((clause) => ({
    kind:
      clause.token === ts.SyntaxKind.ExtendsKeyword
        ? ('extends' as const)
        : ('implements' as const),
    ...wholeSite(index, clause),
  }));

const parameterDefaultSites = (index: CoreIndex, node: ts.Node): CoreSetupSite[] => {
  const signature = asSignature(node);
  if (signature === undefined) return [];
  return signature.parameters.flatMap((parameter) =>
    parameter.initializer === undefined
      ? []
      : [{ kind: 'parameter-default' as const, ...wholeSite(index, parameter.initializer) }],
  );
};

export const setupSites = (index: CoreIndex, id: string): readonly CoreSetupSite[] => {
  const node = index.nodeById.get(id);
  if (node === undefined) return [];
  return [
    ...decoratorSites(index, node),
    ...heritageSites(index, node),
    ...parameterDefaultSites(index, node),
  ];
};

export const mentionSites = (
  index: CoreIndex,
  ownerId: string,
  ref: ExportRef,
): readonly CoreSourceSite[] => {
  const declaration = exportedDeclarationOf(index, ref);
  if (declaration === undefined) return [];
  return (index.mentions.get(declaration) ?? [])
    .filter((mention) => mention.ownerId === ownerId)
    .map((mention) => wholeSite(index, mention.node));
};
