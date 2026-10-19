import { resolve } from 'node:path';
import type { Result, ResultAsync } from 'neverthrow';
import { err, errAsync, ok } from 'neverthrow';
import type { StackTrace } from '../runtime/index';
import { getInternalClassMetadata } from '../runtime/index';
import { findClassAtPosition } from './ast.lib';
import type { InspectError, InspectOptions } from './inspect.types';
import type { Position } from './position.lib';
import { resolveDefinitionPosition, resolvePosition } from './position.lib';
import type { CachedProgram, ProgramCacheError } from './program-cache.lib';
import { getOrCreateProgram } from './program-cache.lib';

type ClassDeclaration = {
  readonly node: import('typescript').ClassDeclaration;
  readonly position: Position;
};

const classAtExpression = (
  sourceFile: import('typescript').SourceFile,
  expression: Position | undefined,
  ts: CachedProgram['ts'],
): import('typescript').ClassDeclaration | undefined => {
  if (expression?.sourceFile !== sourceFile.fileName) return undefined;
  const starts = sourceFile.getLineStarts();
  const start = starts[expression.line - 1];
  const end = starts[expression.line] ?? sourceFile.end;
  if (start === undefined || expression.column <= 0 || start + expression.column - 1 >= end)
    return undefined;
  return findClassAtPosition(sourceFile, start + expression.column - 1, ts);
};

const uniqueClassByName = (
  sourceFile: import('typescript').SourceFile,
  name: string,
  ts: CachedProgram['ts'],
): import('typescript').ClassDeclaration | undefined => {
  const candidates: import('typescript').ClassDeclaration[] = [];
  const visit = (node: import('typescript').Node): void => {
    if (ts.isClassDeclaration(node) && node.name?.text === name) candidates.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return candidates.length === 1 ? candidates[0] : undefined;
};

/** Select a declaration only inside the application module. A captured factory
 * expression disambiguates repeated names; otherwise the name must be unique.
 */
export const resolveClassDeclaration = (
  cls: { readonly name: string },
  trace: StackTrace | undefined,
  cached: CachedProgram,
): Result<ClassDeclaration, InspectError> => {
  const moduleHint = resolveDefinitionPosition(trace);
  if (!moduleHint)
    return err({
      code: 'POSITION_INVALID',
      message: `No definition module captured for ${cls.name}`,
    });
  const { program, ts } = cached;
  const sourceFile = program.getSourceFile(moduleHint.sourceFile);
  if (!sourceFile)
    return err({
      code: 'SOURCE_NOT_FOUND',
      message: `Source file not found: ${moduleHint.sourceFile}`,
    });
  const candidate = classAtExpression(sourceFile, resolvePosition(trace), ts);
  const node =
    candidate?.name?.text === cls.name ? candidate : uniqueClassByName(sourceFile, cls.name, ts);
  const keyword = node
    ?.getChildren(sourceFile)
    .find((child) => child.kind === ts.SyntaxKind.ClassKeyword);
  if (!node || !keyword)
    return err({
      code: 'DECLARATION_NOT_FOUND',
      message: `Cannot uniquely identify class ${cls.name} in ${sourceFile.fileName}`,
    });
  const { line, character } = ts.getLineAndCharacterOfPosition(
    sourceFile,
    keyword.getStart(sourceFile),
  );
  return ok({
    node,
    position: { sourceFile: sourceFile.fileName, line: line + 1, column: character + 1 },
  });
};

/** Position of the class keyword, verified against the TypeScript source AST.
 * @throws {UnsupportedTypeScriptVersionError}
 */
export const getClassDeclarationPosition = (
  cls: { readonly name: string },
  options?: InspectOptions,
): ResultAsync<Position, InspectError | ProgramCacheError> => {
  const stored = getInternalClassMetadata(cls);
  if (!stored)
    return errAsync({
      code: 'NO_METADATA',
      message: `No decorator metadata found for class ${cls.name}`,
    });
  return getOrCreateProgram(resolve(options?.tsconfig ?? './tsconfig.json'))
    .andThen((cached) => resolveClassDeclaration(cls, stored.trace, cached))
    .map((declaration) => declaration.position);
};
