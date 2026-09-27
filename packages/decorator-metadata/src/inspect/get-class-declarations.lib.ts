import { resolve } from 'node:path';

import type { ResultAsync } from 'neverthrow';
import { errAsync, okAsync } from 'neverthrow';

import { decoratorInfoList } from './ast.lib';
import { buildExportAliasMaps, exportNameOfLocalClass } from './get-dependency-sources.lib';
import type { ClassDeclarationInfo, InspectError } from './inspect.types';
import type { ProgramCacheError } from './program-cache.lib';
import { getOrCreateProgram } from './program-cache.lib';

const DEFAULT_TSCONFIG = './tsconfig.json';

type TypeScriptModule = typeof import('typescript');
type TSSourceFile = import('typescript').SourceFile;

const lineOf = (sourceFile: TSSourceFile, pos: number): number =>
  sourceFile.getLineAndCharacterOfPosition(pos).line + 1;

const hasExportModifier = (
  modifiers: readonly import('typescript').ModifierLike[] | undefined,
  ts: TypeScriptModule,
): boolean => (modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** @throws {UnsupportedTypeScriptVersionError} */
export const getClassDeclarations = (
  filePath: string,
  options?: { readonly tsconfig?: string },
): ResultAsync<readonly ClassDeclarationInfo[], InspectError | ProgramCacheError> => {
  const tsconfigPath = resolve(options?.tsconfig ?? DEFAULT_TSCONFIG);
  return getOrCreateProgram(tsconfigPath).andThen(({ program, checker, ts }) => {
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      return errAsync<readonly ClassDeclarationInfo[], InspectError>({
        code: 'SOURCE_NOT_FOUND',
        message: `Source file not found: ${filePath}`,
      });
    }
    // レビュー指摘6: default export / `export { A as B }` では exportName が宣言名と異なる。
    // ClassNode の id/name は常に宣言名(stmt.name.text)を使い、exportName は別フィールドで
    // 「ClassSource.exportName からこの宣言を引き当てる」ための対応付けにのみ使う
    const aliases = buildExportAliasMaps(sourceFile, ts);
    const declarations: ClassDeclarationInfo[] = [];
    for (const stmt of sourceFile.statements) {
      if (!ts.isClassDeclaration(stmt) || stmt.name === undefined) continue;
      const declName = stmt.name.text;
      const exportName = exportNameOfLocalClass(sourceFile, declName, aliases, ts);
      declarations.push({
        name: declName,
        ...(exportName !== undefined && exportName !== declName ? { exportName } : {}),
        loc: {
          start: lineOf(sourceFile, stmt.getStart(sourceFile)),
          end: lineOf(sourceFile, stmt.getEnd()),
        },
        decorators: decoratorInfoList(sourceFile, stmt.modifiers, checker, ts),
        // `export { X }` 別文での再export も拾う(exportNameOfLocalClass が alias map も見るため)
        exported: hasExportModifier(stmt.modifiers, ts) || exportName !== undefined,
      });
    }
    return okAsync(declarations);
  });
};
