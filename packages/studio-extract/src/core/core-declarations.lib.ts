import ts from 'typescript';

import type { CoreIndex } from './core-index.lib';
import {
  addDeclaration,
  addFileDeclaration,
  addMember,
  classGroupOf,
  declarationIdOf,
  fileGroupOf,
  sourceDetail,
} from './core-index.lib';
import type { DeclarationKind } from './snapshot-schema.lib';
import { asFunctionValue, functionSignature, signatureStartOf } from './source-text.lib';

/** pass 1 が集める、pass 2 で歩く対象 */
export type DeclarationPass = {
  readonly walkables: { node: ts.Node; owner: string }[];
  readonly containers: { node: ts.ClassDeclaration | ts.InterfaceDeclaration; id: string }[];
};

const registerCallbacks = (
  index: CoreIndex,
  root: ts.Node,
  owningGroupId: string,
  enclosingId: string,
): void => {
  let ordinal = 0;
  ts.forEachChild(root, function step(child): void {
    if (ts.isDecorator(child)) return;
    const fn = asFunctionValue(child);
    if (fn === undefined) {
      ts.forEachChild(child, step);
      return;
    }
    const name = `@callback:${ordinal}`;
    ordinal += 1;
    const start = fn.getStart();
    const id = addDeclaration(
      index,
      {
        id: declarationIdOf(owningGroupId, enclosingId, 'callback', 'instance', name),
        groupId: owningGroupId,
        name,
        kind: 'callback',
        enclosingDeclarationId: enclosingId,
        source: sourceDetail(index, fn, functionSignature(fn, start), start),
        position: start,
      },
      fn,
    );
    index.callbackIds.set(fn, id);
    registerCallbacks(index, fn, owningGroupId, id);
  });
};

const registerMember = (
  index: CoreIndex,
  pass: DeclarationPass,
  owningGroupId: string,
  node: ts.Node,
): void => {
  const id = addMember(index, owningGroupId, node);
  if (id === null) return;
  registerCallbacks(index, node, owningGroupId, id);
  pass.walkables.push({ node, owner: id });
};

const registerFileDeclaration = (
  index: CoreIndex,
  pass: DeclarationPass,
  spec: {
    readonly fileId: string;
    readonly node: ts.Node;
    readonly name: string;
    readonly kind: DeclarationKind;
    readonly start: number;
    readonly callbackRoot: ts.Node;
  },
): string => {
  const id = addFileDeclaration(index, spec);
  registerCallbacks(index, spec.callbackRoot, spec.fileId, id);
  pass.walkables.push({ node: spec.node, owner: id });
  return id;
};

const registerContainer = (
  index: CoreIndex,
  pass: DeclarationPass,
  statement: ts.ClassDeclaration | ts.InterfaceDeclaration,
): void => {
  const id = classGroupOf(index, statement, 'included');
  pass.containers.push({ node: statement, id });
  for (const member of statement.members) registerMember(index, pass, id, member);
};

// declaration merge (declare module '…') は v1 に置き場が無いので file group に置く(付録O)
const registerModuleDeclaration = (
  index: CoreIndex,
  pass: DeclarationPass,
  file: ts.SourceFile,
  statement: ts.ModuleDeclaration,
): void => {
  const body = statement.body;
  if (body === undefined || !ts.isModuleBlock(body)) return;
  const id = fileGroupOf(index, file);
  for (const inner of body.statements) {
    if (!ts.isInterfaceDeclaration(inner)) continue;
    for (const member of inner.members) registerMember(index, pass, id, member);
  }
};

const registerVariableStatement = (
  index: CoreIndex,
  pass: DeclarationPass,
  fileId: string,
  statement: ts.VariableStatement,
): void => {
  for (const decl of statement.declarationList.declarations) {
    if (!ts.isIdentifier(decl.name)) continue;
    const fn = asFunctionValue(decl.initializer);
    const id = registerFileDeclaration(index, pass, {
      fileId,
      node: decl,
      name: decl.name.text,
      kind: fn === undefined ? 'value' : 'function',
      start: decl.getStart(),
      callbackRoot: fn ?? decl,
    });
    // 変数に直接束縛された関数は宣言を二重化しないので、初期化子も同じIDへ解決させる
    if (fn !== undefined) index.nodeToDecl.set(fn, id);
  }
};

const registerFileStatement = (
  index: CoreIndex,
  pass: DeclarationPass,
  file: ts.SourceFile,
  statement: ts.Statement,
): void => {
  if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) return;
  const fileId = fileGroupOf(index, file);
  if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
    registerFileDeclaration(index, pass, {
      fileId,
      node: statement,
      name: statement.name.text,
      kind: 'function',
      start: signatureStartOf(statement),
      callbackRoot: statement,
    });
    return;
  }
  if (ts.isVariableStatement(statement)) {
    registerVariableStatement(index, pass, fileId, statement);
    return;
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    registerFileDeclaration(index, pass, {
      fileId,
      node: statement,
      name: statement.name.text,
      kind: 'type',
      start: statement.getStart(),
      callbackRoot: statement,
    });
    return;
  }
  pass.walkables.push({ node: statement, owner: fileId });
};

const registerStatement = (
  index: CoreIndex,
  pass: DeclarationPass,
  file: ts.SourceFile,
  statement: ts.Statement,
): void => {
  if (
    (ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    registerContainer(index, pass, statement);
    return;
  }
  if (ts.isModuleDeclaration(statement)) {
    registerModuleDeclaration(index, pass, file, statement);
    return;
  }
  registerFileStatement(index, pass, file, statement);
};

export const collectDeclarations = (
  index: CoreIndex,
  appFiles: readonly ts.SourceFile[],
): DeclarationPass => {
  const pass: DeclarationPass = { walkables: [], containers: [] };
  for (const file of appFiles) {
    for (const statement of file.statements) registerStatement(index, pass, file, statement);
  }
  return pass;
};
