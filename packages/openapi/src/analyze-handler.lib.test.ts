import type { Position } from '@zeltjs/decorator-metadata/inspect';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { analyzeParamFromPosition } from './analyze-handler.lib';

const fileName = '/virtual/controller.ts';

const findFirstParameter = (sourceFile: ts.SourceFile): ts.ParameterDeclaration => {
  const visit = (node: ts.Node): ts.ParameterDeclaration | undefined => {
    if (ts.isParameter(node)) return node;
    return ts.forEachChild(node, visit);
  };
  const param = visit(sourceFile);
  if (!param) throw new Error('parameter not found');
  return param;
};

const analyzeSource = (source: string) => {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const param = findFirstParameter(sourceFile);
  const pos = ts.getLineAndCharacterOfPosition(sourceFile, param.getStart(sourceFile));
  const program = {
    getSourceFile: (path: string) => (path === fileName ? sourceFile : undefined),
  } as ts.Program;

  return analyzeParamFromPosition(program, ts, {
    sourceFile: fileName,
    line: pos.line + 1,
    column: pos.character + 1,
  } satisfies Position);
};

describe('analyzeParamFromPosition', () => {
  it('detects request() imported from @zeltjs/core', () => {
    const ref = analyzeSource(`
      import { request } from '@zeltjs/core';
      const Schema = {};
      class Controller {
        create(req = request(Schema, { target: 'form' })) {}
      }
    `);

    expect(ref).toEqual({
      kind: 'valibot-named',
      modulePath: fileName,
      exportName: 'Schema',
      target: 'form',
    });
  });

  it('detects aliased request() imported from @zeltjs/core', () => {
    const ref = analyzeSource(`
      import { request as coreRequest } from '@zeltjs/core';
      const Schema = {};
      class Controller {
        create(req = coreRequest(Schema)) {}
      }
    `);

    expect(ref).toEqual({
      kind: 'valibot-named',
      modulePath: fileName,
      exportName: 'Schema',
      target: 'json',
    });
  });

  it('ignores local functions named request()', () => {
    const ref = analyzeSource(`
      const request = <T>(value: T): T => value;
      const Schema = {};
      class Controller {
        create(req = request(Schema)) {}
      }
    `);

    expect(ref).toEqual({ kind: 'none' });
  });

  it('ignores request() imported from @zeltjs/validator-valibot', () => {
    const ref = analyzeSource(`
      import { request } from '@zeltjs/validator-valibot';
      const Schema = {};
      class Controller {
        create(req = request(Schema)) {}
      }
    `);

    expect(ref).toEqual({ kind: 'none' });
  });
});
