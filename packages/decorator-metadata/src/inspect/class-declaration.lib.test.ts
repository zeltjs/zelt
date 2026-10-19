import { resolve } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { StackTrace } from '../runtime/index';
import { CaptureStackError } from '../runtime/index';
import { resolveClassDeclaration } from './class-declaration.lib';

const sourceFileName = 'C:/app/repeated.ts';
const stackFileName = 'C:\\app\\repeated.ts';
const sourceText = [
  'function first() {',
  '  @Decorate()',
  '  class Repeated {}',
  '}',
  'function second() {',
  '  @Decorate()',
  '  class Repeated {}',
  '}',
].join('\n');

const createProgram = () => {
  const options: ts.CompilerOptions = { noLib: true, noResolve: true };
  const sourceFile = ts.createSourceFile(sourceFileName, sourceText, ts.ScriptTarget.Latest, true);
  const isSourceFile = (name: string) => name.replaceAll('\\', '/') === sourceFileName;
  const host: ts.CompilerHost = {
    ...ts.createCompilerHost(options),
    getCurrentDirectory: () => 'C:/app',
    getSourceFile: (name) => (isSourceFile(name) ? sourceFile : undefined),
    fileExists: isSourceFile,
    readFile: (name) => (isSourceFile(name) ? sourceText : undefined),
  };
  const program = ts.createProgram([sourceFileName], options, host);
  return { program, checker: program.getTypeChecker(), ts };
};

const errorWithFrames = (frames: readonly string[]): CaptureStackError => {
  const error = new CaptureStackError();
  const framework = resolve(__dirname, '../runtime/trace.lib.ts');
  error.stack = [
    'Error',
    `    at captureStackTrace (${framework}:1:1)`,
    ...frames.map((frame) => `    at ${frame}`),
  ].join('\n');
  return error;
};

describe('class declaration source identity', () => {
  it.each([
    { name: 'first', expressionLine: 2, declarationLine: 3 },
    { name: 'second', expressionLine: 6, declarationLine: 7 },
  ])('disambiguates $name with Windows stack paths and normalized compiler paths', ({
    name,
    expressionLine,
    declarationLine,
  }) => {
    const cached = createProgram();
    expect(cached.program.getSourceFile(stackFileName)).toBe(
      cached.program.getSourceFile(sourceFileName),
    );
    const caller = 'run (C:\\app\\bootstrap.ts:20:1)';
    const trace: StackTrace = {
      _brand: 'StackTrace',
      error: errorWithFrames([
        `Decorate (C:\\lib\\decorator.ts:1:1)`,
        `${name} (${stackFileName}:${expressionLine}:4)`,
        caller,
      ]),
      callError: errorWithFrames([`${name} (${stackFileName}:90:1)`, caller]),
    };
    const result = resolveClassDeclaration({ name: 'Repeated' }, trace, cached);
    expect(result.isOk() && result.value.position).toEqual({
      sourceFile: sourceFileName,
      line: declarationLine,
      column: 3,
    });
  });
});
