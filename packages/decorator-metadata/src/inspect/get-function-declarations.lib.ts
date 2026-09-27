import { resolve } from 'node:path';

import type { ResultAsync } from 'neverthrow';
import { errAsync, okAsync } from 'neverthrow';

import { collectedFunctionRef, collectFunctionDeclarations } from './function-collect.lib';
import type { FunctionDeclarationInfo, InspectError } from './inspect.types';
import type { ProgramCacheError } from './program-cache.lib';
import { getOrCreateProgram } from './program-cache.lib';

const DEFAULT_TSCONFIG = './tsconfig.json';

const lineOf = (sourceFile: import('typescript').SourceFile, pos: number): number =>
  sourceFile.getLineAndCharacterOfPosition(pos).line + 1;

/** @throws {UnsupportedTypeScriptVersionError} from resolve-typescript.lib.ts:resolveTypeScript */
export const getFunctionDeclarations = (
  filePath: string,
  options?: { readonly tsconfig?: string },
): ResultAsync<readonly FunctionDeclarationInfo[], InspectError | ProgramCacheError> => {
  const tsconfigPath = resolve(options?.tsconfig ?? DEFAULT_TSCONFIG);
  return getOrCreateProgram(tsconfigPath).andThen(({ program, checker, ts }) => {
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      return errAsync<readonly FunctionDeclarationInfo[], InspectError>({
        code: 'SOURCE_NOT_FOUND',
        message: `Source file not found: ${filePath}`,
      });
    }
    const declarations: FunctionDeclarationInfo[] = collectFunctionDeclarations(
      sourceFile,
      checker,
      ts,
    ).map((fn) => ({
      ref: collectedFunctionRef(filePath, fn),
      decorators: fn.decorators,
      visibility: fn.visibility,
      loc: {
        start: lineOf(sourceFile, fn.node.getStart(sourceFile)),
        end: lineOf(sourceFile, fn.node.getEnd()),
      },
    }));
    return okAsync(declarations);
  });
};
