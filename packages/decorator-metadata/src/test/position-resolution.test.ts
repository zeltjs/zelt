import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getClassDeclarationPosition,
  getClassSource,
  getDecoratorApplicationPosition,
  getTypeMetadata,
  resolveDefinitionPosition,
  resolvePosition,
} from '../inspect/index';
import type { StackTrace } from '../runtime/index';
import { CaptureStackError } from '../runtime/index';

const framework = resolve(__dirname, '../runtime/decorators.lib.ts');
const bundle = '/virtual/app/bundle.js';
const errorWithFrames = (frames: readonly string[]): CaptureStackError => {
  const error = new CaptureStackError();
  error.stack = [
    'CaptureStackError',
    `    at captureStackTrace (${framework}:1:1)`,
    ...frames.map((frame) => `    at ${frame}`),
  ].join('\n');
  return error;
};
const traceWithFrames = (define: readonly string[], call: readonly string[]): StackTrace => ({
  _brand: 'StackTrace',
  error: errorWithFrames(define),
  callError: errorWithFrames(call),
});

describe('position contracts', () => {
  it.each([
    'Controller',
    'sameName',
    '',
  ])('keeps same-file wrapper, application and caller frames distinct (%s)', (name) => {
    const frame = (line: number) =>
      name ? `${name} (${bundle}:${line}:3)` : `${bundle}:${line}:3`;
    const outer = `runCommand (${bundle}:200:7)`;
    const trace = traceWithFrames(
      [frame(10), frame(20), frame(100), outer],
      [`applyClassDecs (${bundle}:300:1)`, frame(150), outer],
    );
    expect(resolvePosition(trace)).toEqual({ sourceFile: bundle, line: 100, column: 3 });
    expect(resolveDefinitionPosition(trace)).toEqual({ sourceFile: bundle, line: 150, column: 3 });
  });

  it('does not let a shared outer caller keep an internal wrapper', () => {
    const wrapper = '/virtual/core/dist/index.js';
    const trace = traceWithFrames(
      [`Controller (${wrapper}:10:1)`, `${bundle}:40:5`, `runCommand (${wrapper}:70:1)`],
      [`${bundle}:80:1`, `runCommand (${wrapper}:70:1)`],
    );
    expect(resolvePosition(trace)).toEqual({ sourceFile: bundle, line: 40, column: 5 });
  });

  it('leaves repeated activations unresolved without distinguishing outer context', () => {
    const trace = traceWithFrames([`${bundle}:10:1`, `${bundle}:20:1`], [`${bundle}:30:1`]);
    expect(resolvePosition(trace)).toBeUndefined();
  });

  it('does not use factory coordinates when the application stack is truncated inside machinery', () => {
    const trace = traceWithFrames(
      [`Controller (${bundle}:10:1)`, `${bundle}:40:5`],
      [`applyClassContext (${framework}:20:1)`],
    );
    expect(resolvePosition(trace)).toBeUndefined();
    expect(resolveDefinitionPosition(trace)).toBeUndefined();
  });

  it('requires caller evidence when the only matching name may belong to a truncated wrapper', () => {
    const trace = traceWithFrames([`sameName (${bundle}:10:1)`], [`sameName (${bundle}:30:1)`]);
    expect(resolvePosition(trace)).toBeUndefined();
  });

  it('does not join caller context across an unparseable frame', () => {
    const outer = `runCommand (${bundle}:70:1)`;
    const trace = traceWithFrames(
      [`${bundle}:10:1`, 'unavailable', outer],
      [`${bundle}:30:1`, 'unavailable', outer],
    );
    expect(resolvePosition(trace)).toBeUndefined();
  });

  it('resolves each real same-file decorator expression and verifies the declaration separately', async () => {
    const { SameFile, Composed, DirectlyDecorated } = await import(
      './fixtures/decorator-application-position/same-file'
    );
    const sourceFile = resolve(__dirname, 'fixtures/decorator-application-position/same-file.ts');
    const hasKind =
      (kind: string) =>
      (props: object): boolean =>
        'kind' in props && props.kind === kind;
    expect(getDecoratorApplicationPosition(SameFile, { kind: 'class' }, hasKind('first'))).toEqual({
      sourceFile,
      line: 8,
      column: 2,
    });
    expect(getDecoratorApplicationPosition(SameFile, { kind: 'class' }, hasKind('second'))).toEqual(
      { sourceFile, line: 9, column: 2 },
    );
    const options = { tsconfig: resolve(__dirname, '../../tsconfig.json') };
    const declaration = await getClassDeclarationPosition(SameFile, options);
    expect(declaration.isOk() && declaration.value).toEqual({ sourceFile, line: 10, column: 8 });
    const metadata = await getTypeMetadata(DirectlyDecorated, options);
    expect(metadata.isOk() && metadata.value.pos).toEqual({ sourceFile, line: 19, column: 8 });
    for (const cls of [SameFile, Composed, DirectlyDecorated]) {
      const source = await getClassSource(cls);
      expect(source.isOk() && source.value).toEqual({ filePath: sourceFile, exportName: cls.name });
    }
  });

  it('does not guess a declaration from a non-unique name when no factory expression was captured there', async () => {
    const { firstRepeated, secondRepeated } = await import(
      './fixtures/decorator-application-position/same-file'
    );
    for (const cls of [firstRepeated(), secondRepeated()]) {
      const result = await getClassDeclarationPosition(cls, {
        tsconfig: resolve(__dirname, '../../tsconfig.json'),
      });
      expect(result.isErr() && result.error.code).toBe('DECLARATION_NOT_FOUND');
    }
  });
});
