import { relative } from 'node:path';

import ts from 'typescript';

import type {
  CoreDeclaration,
  CoreEvidence,
  CoreGroup,
  CoreLocation,
  MutableRelation,
  Target,
} from './core-facts.types';
import type { ResolvedConfig } from './extract-config.lib';
import type { DeclarationKind, SourceDetail, TsRelationKind } from './snapshot-schema.lib';
import {
  classHeader,
  declarationSignature,
  hasModifier,
  memberKindOf,
  memberNameOf,
  signatureStartOf,
} from './source-text.lib';

const toPosix = (path: string): string => path.replaceAll('\\', '/');

const groupIdOf = (kind: string, filePath: string, name: string): string =>
  `group:${JSON.stringify([kind, filePath, name])}`;

export const declarationIdOf = (
  owningGroupId: string,
  enclosingId: string | null,
  kind: string,
  scope: 'static' | 'instance',
  name: string,
): string => `decl:${JSON.stringify([owningGroupId, enclosingId, kind, scope, name])}`;

/**
 * One Program's worth of index state. Every core helper takes it explicitly so
 * the traversal stays a set of plain functions instead of one giant closure.
 */
export type CoreIndex = {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly config: ResolvedConfig;
  readonly rel: (fileName: string) => string;
  readonly groups: Map<string, CoreGroup>;
  readonly declarations: Map<string, CoreDeclaration>;
  readonly relations: Map<string, MutableRelation>;
  readonly nodeToDecl: Map<ts.Node, string>;
  readonly nodeToGroup: Map<ts.Node, string>;
  readonly callbackIds: Map<ts.Node, string>;
  readonly interfaceMembers: Set<string>;
  readonly whitelist: Set<ts.Node>;
  readonly ignored: Set<ts.Node>;
};

// ── source spans ────────────────────────────────────────────────────────────
export const locationOf = (
  index: CoreIndex,
  node: ts.Node,
  start: number,
  end: number,
): CoreLocation => {
  const file = node.getSourceFile();
  return {
    filePath: index.rel(file.fileName),
    startLine: file.getLineAndCharacterOfPosition(start).line + 1,
    endLine: file.getLineAndCharacterOfPosition(end).line + 1,
  };
};

export const allowsText = (index: CoreIndex, node: ts.Node): boolean =>
  index.config.isSourceTextAllowed(index.rel(node.getSourceFile().fileName));

export const sourceDetail = (
  index: CoreIndex,
  node: ts.Node,
  signature: string,
  start: number,
): SourceDetail => {
  const file = node.getSourceFile();
  return {
    location: locationOf(index, node, start, node.getEnd()),
    signature,
    excerpt: allowsText(index, node)
      ? { kind: 'code', text: file.text.slice(start, node.getEnd()) }
      : { kind: 'declaration-only' },
  };
};

// ── group / declaration registration ────────────────────────────────────────
const addGroup = (index: CoreIndex, group: CoreGroup, node: ts.Node | null): string => {
  if (!index.groups.has(group.id)) index.groups.set(group.id, group);
  if (node !== null) index.nodeToGroup.set(node, group.id);
  return group.id;
};

export const addDeclaration = (index: CoreIndex, decl: CoreDeclaration, node: ts.Node): string => {
  if (!index.declarations.has(decl.id)) index.declarations.set(decl.id, decl);
  index.nodeToDecl.set(node, decl.id);
  return decl.id;
};

export const fileGroupOf = (index: CoreIndex, file: ts.SourceFile): string => {
  const filePath = index.rel(file.fileName);
  const name = filePath.split('/').pop() ?? filePath;
  return addGroup(
    index,
    {
      id: groupIdOf('file', filePath, name),
      name,
      kind: 'file',
      filePath,
      expansion: 'included',
      source: {
        location: {
          filePath,
          startLine: 1,
          endLine: file.getLineAndCharacterOfPosition(file.end).line + 1,
        },
        signature: filePath,
        excerpt: { kind: 'declaration-only' },
      },
      position: 0,
    },
    null,
  );
};

export const classGroupOf = (
  index: CoreIndex,
  node: ts.ClassDeclaration | ts.InterfaceDeclaration,
  expansion: 'included' | 'boundary',
): string => {
  const existing = index.nodeToGroup.get(node);
  if (existing !== undefined) return existing;
  const filePath = index.rel(node.getSourceFile().fileName);
  const name = node.name?.text ?? '(anonymous)';
  const start = node.getStart();
  const kind = ts.isClassDeclaration(node) ? 'class' : 'interface';
  return addGroup(
    index,
    {
      id: groupIdOf(kind, filePath, name),
      name,
      kind,
      filePath,
      expansion,
      source: {
        location: locationOf(index, node, start, node.getEnd()),
        signature: classHeader(node, start),
        excerpt: { kind: 'declaration-only' },
      },
      position: start,
    },
    node,
  );
};

export const addMember = (
  index: CoreIndex,
  owningGroupId: string,
  node: ts.Node,
): string | null => {
  const kind = memberKindOf(node);
  const name = memberNameOf(node);
  if (kind === null || name === null) return null;
  const start = node.getStart();
  const scope = hasModifier(node, ts.SyntaxKind.StaticKeyword) ? 'static' : 'instance';
  const id = declarationIdOf(owningGroupId, null, kind, scope, name);
  if (kind === 'signature') index.interfaceMembers.add(id);
  return addDeclaration(
    index,
    {
      id,
      groupId: owningGroupId,
      name,
      kind,
      enclosingDeclarationId: null,
      source: sourceDetail(
        index,
        node,
        declarationSignature(node, signatureStartOf(node), (n) => allowsText(index, n)),
        start,
      ),
      position: start,
    },
    node,
  );
};

export const addFileDeclaration = (
  index: CoreIndex,
  spec: {
    readonly fileId: string;
    readonly node: ts.Node;
    readonly name: string;
    readonly kind: DeclarationKind;
    readonly start: number;
  },
): string =>
  addDeclaration(
    index,
    {
      id: declarationIdOf(spec.fileId, null, spec.kind, 'instance', spec.name),
      groupId: spec.fileId,
      name: spec.name,
      kind: spec.kind,
      enclosingDeclarationId: null,
      source: sourceDetail(
        index,
        spec.node,
        declarationSignature(spec.node, spec.start, (n) => allowsText(index, n)),
        spec.start,
      ),
      position: spec.start,
    },
    spec.node,
  );

// ── library whitelist ───────────────────────────────────────────────────────
const moduleSymbolOf = (index: CoreIndex, specifier: string): ts.Symbol | undefined => {
  const mapped = index.config.sourceModules[specifier];
  if (mapped === undefined) return undefined;
  const file = index.program.getSourceFiles().find((f) => f.fileName === toPosix(mapped));
  if (file === undefined) return undefined;
  return index.checker.getSymbolAtLocation(file);
};

export const exportedDeclarations = (
  index: CoreIndex,
  specifier: string,
  names: readonly string[],
): ts.Declaration[] => {
  const moduleSymbol = moduleSymbolOf(index, specifier);
  if (moduleSymbol === undefined) return [];
  const wanted = new Set(names);
  const out: ts.Declaration[] = [];
  for (const symbol of index.checker.getExportsOfModule(moduleSymbol)) {
    if (!wanted.has(symbol.name)) continue;
    const resolved =
      (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? index.checker.getAliasedSymbol(symbol) : symbol;
    out.push(...(resolved.declarations ?? []));
  }
  return out;
};

export const createCoreIndex = (program: ts.Program, config: ResolvedConfig): CoreIndex => {
  const index: CoreIndex = {
    program,
    checker: program.getTypeChecker(),
    config,
    rel: (fileName) => toPosix(relative(config.root, fileName)),
    groups: new Map(),
    declarations: new Map(),
    relations: new Map(),
    nodeToDecl: new Map(),
    nodeToGroup: new Map(),
    callbackIds: new Map(),
    interfaceMembers: new Set(),
    whitelist: new Set(),
    ignored: new Set(),
  };
  for (const entry of config.raw.mapPackages) {
    for (const decl of exportedDeclarations(index, entry.package, entry.exports)) {
      if (ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl)) index.whitelist.add(decl);
    }
  }
  for (const entry of config.raw.ignore) {
    for (const decl of exportedDeclarations(index, entry.package, entry.exports)) {
      index.ignored.add(decl);
    }
  }
  return index;
};

// ── targets ─────────────────────────────────────────────────────────────────
const containerOf = (
  index: CoreIndex,
  node: ts.Node,
): ts.ClassDeclaration | ts.InterfaceDeclaration | null => {
  const candidate = index.whitelist.has(node) ? node : node.parent;
  if (!index.whitelist.has(candidate)) return null;
  if (ts.isClassDeclaration(candidate) || ts.isInterfaceDeclaration(candidate)) return candidate;
  return null;
};

const boundaryTarget = (index: CoreIndex, node: ts.Node): Target | null => {
  if (index.ignored.has(node) || index.ignored.has(node.parent)) return null;
  const container = containerOf(index, node);
  if (container === null) return null;
  const containerId = classGroupOf(index, container, 'boundary');
  if (container === node) return { id: containerId, isInterfaceMember: false };
  const id = addMember(index, containerId, node);
  if (id === null) return null;
  return { id, isInterfaceMember: ts.isInterfaceDeclaration(container) };
};

export const targetFor = (index: CoreIndex, node: ts.Node): Target | null => {
  const decl = index.nodeToDecl.get(node);
  if (decl !== undefined) return { id: decl, isInterfaceMember: index.interfaceMembers.has(decl) };
  const group = index.nodeToGroup.get(node);
  if (group !== undefined) return { id: group, isInterfaceMember: false };
  return boundaryTarget(index, node);
};

export const targetOfSymbol = (index: CoreIndex, symbol: ts.Symbol | undefined): Target | null => {
  for (const decl of symbol?.declarations ?? []) {
    const target = targetFor(index, decl);
    if (target !== null) return target;
  }
  return null;
};

export const resolveSymbol = (index: CoreIndex, node: ts.Node): ts.Symbol | undefined => {
  const symbol = index.checker.getSymbolAtLocation(node);
  if (symbol === undefined) return undefined;
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? index.checker.getAliasedSymbol(symbol)
    : symbol;
};

const ownerAt = (index: CoreIndex, node: ts.Node): string | undefined =>
  index.nodeToDecl.get(node) ?? index.nodeToGroup.get(node);

export const ownerOf = (index: CoreIndex, node: ts.Node): string | null => {
  const found = ts.findAncestor(node, (current) => ownerAt(index, current) !== undefined);
  return found === undefined ? null : (ownerAt(index, found) ?? null);
};

// ── relations ───────────────────────────────────────────────────────────────
export const emit = (
  index: CoreIndex,
  ownerId: string,
  to: string,
  kind: TsRelationKind,
  node: ts.Node,
  expression: string,
  start = node.getStart(),
  end = node.getEnd(),
): void => {
  const key = `${ownerId}\u0000${to}\u0000${kind}`;
  const evidence: CoreEvidence = { location: locationOf(index, node, start, end), expression };
  const existing = index.relations.get(key);
  if (existing === undefined) {
    index.relations.set(key, { ownerId, to, kind, evidence: [evidence] });
    return;
  }
  // v1 の根拠は行と式だけなので、同じ行・同じ式の使用箇所は1件にまとめる
  const duplicate = existing.evidence.some(
    (e) =>
      e.location.startLine === evidence.location.startLine && e.expression === evidence.expression,
  );
  if (!duplicate) existing.evidence.push(evidence);
};
