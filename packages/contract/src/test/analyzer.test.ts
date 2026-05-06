import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { analyzeControllers } from '../analyzer/internal-representation';
import { createProject } from '../analyzer/project';

const fixturePath = resolve(import.meta.dirname, 'fixtures/sample.controller.ts');
const uploadFixturePath = resolve(import.meta.dirname, 'fixtures/upload.controller.ts');
const tsConfigFilePath = resolve(import.meta.dirname, '../../tsconfig.json');

describe('analyzeControllers', () => {
  const project = createProject({ tsConfigFilePath, controllerFiles: [fixturePath] });
  const ir = analyzeControllers(project, [{ filePath: fixturePath, exportName: 'UserController' }]);

  it('extracts decorator metadata', () => {
    const routes = ir.flatMap((c) => c.routes);
    expect(routes.map((r) => `${r.method} ${r.fullPath}`)).toEqual([
      'GET /users/:id',
      'POST /users',
    ]);
  });

  it('detects validated() arg with schema identifier', () => {
    const create = ir[0]?.routes.find((r) => r.method === 'POST');
    expect(create?.requestSchema).toEqual({
      kind: 'valibot-named',
      module: fixturePath,
      exportName: 'CreateUserBody',
      target: 'json',
    });
  });

  it('detects pathParam() arg', () => {
    const show = ir[0]?.routes.find((r) => r.method === 'GET');
    expect(show?.pathParams).toEqual(['id']);
  });

  it('extracts response type node', () => {
    const show = ir[0]?.routes.find((r) => r.method === 'GET');
    expect(show?.responseType.kind).toBe('ts-named');
    if (show?.responseType.kind === 'ts-named') {
      expect(show.responseType.name).toBe('User');
    }
  });

  it('detects validated() with form target', () => {
    const uploadProject = createProject({ tsConfigFilePath, controllerFiles: [uploadFixturePath] });
    const uploadIr = analyzeControllers(uploadProject, [
      { filePath: uploadFixturePath, exportName: 'UploadController' },
    ]);
    const upload = uploadIr[0]?.routes.find((r) => r.method === 'POST');
    expect(upload?.requestSchema).toEqual({
      kind: 'valibot-named',
      module: uploadFixturePath,
      exportName: 'UploadBody',
      target: 'form',
    });
  });
});
