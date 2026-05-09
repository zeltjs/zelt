import { resolve } from 'node:path';

import { toJsonSchema } from '@valibot/to-json-schema';
import type { GenericSchema } from 'valibot';
import { describe, expect, it } from 'vitest';

import { analyzeControllers } from '../analyzer/internal-representation';
import { createProject } from '../analyzer/project';
import { emitOpenApi } from '../emit/openapi';
import type { SchemaAdapter, JsonSchema } from '../types/schema-adapter';

const fixturePath = resolve(import.meta.dirname, 'fixtures/sample.controller.ts');
const uploadFixturePath = resolve(import.meta.dirname, 'fixtures/upload.controller.ts');
const tsconfigPath = resolve(import.meta.dirname, '../../tsconfig.json');

// These keys access Record<string, ...> index signatures.
// Using const variables avoids both TS4111 (noPropertyAccessFromIndexSignature)
// and biome's useLiteralKeys (which bans ['literalString'] bracket notation).
const getKey = 'get';
const postKey = 'post';
const responsesKey = 'responses';
const parametersKey = 'parameters';

const requestValidator: SchemaAdapter = {
  toJsonSchema: (schema: unknown): JsonSchema =>
    toJsonSchema(schema as GenericSchema) as unknown as JsonSchema,
};

describe('emitOpenApi', () => {
  it('builds a valid OpenAPI 3.1 document with paths and components', async () => {
    const project = createProject({
      tsConfigFilePath: tsconfigPath,
      controllerFiles: [fixturePath],
    });
    const irResult = analyzeControllers(project, [
      { filePath: fixturePath, exportName: 'UserController' },
    ]);
    expect(irResult.isOk()).toBe(true);
    if (!irResult.isOk()) return;
    const ir = irResult.value;
    const docResult = await emitOpenApi(ir, {
      distDir: '/tmp/generated',
      tsconfigPath,
      requestValidator,
    });
    expect(docResult.isOk()).toBe(true);
    if (!docResult.isOk()) return;
    const doc = docResult.value;

    expect(doc.openapi).toBe('3.1.0');
    expect(doc.paths['/users/{id}']?.[getKey]).toBeDefined();
    expect(doc.paths['/users']?.[postKey]).toBeDefined();
  });

  it('always registers ValidationErrorBody in components.schemas', async () => {
    const project = createProject({
      tsConfigFilePath: tsconfigPath,
      controllerFiles: [fixturePath],
    });
    const irResult = analyzeControllers(project, [
      { filePath: fixturePath, exportName: 'UserController' },
    ]);
    expect(irResult.isOk()).toBe(true);
    if (!irResult.isOk()) return;
    const ir = irResult.value;
    const docResult = await emitOpenApi(ir, {
      distDir: '/tmp/generated',
      tsconfigPath,
      requestValidator,
    });
    expect(docResult.isOk()).toBe(true);
    if (!docResult.isOk()) return;
    const doc = docResult.value;

    const schemaKey = 'ValidationErrorBody';
    expect(doc.components.schemas[schemaKey]).toBeDefined();
  });

  it('auto-registers a 400 response for routes with validated()', async () => {
    const project = createProject({
      tsConfigFilePath: tsconfigPath,
      controllerFiles: [fixturePath],
    });
    const irResult = analyzeControllers(project, [
      { filePath: fixturePath, exportName: 'UserController' },
    ]);
    expect(irResult.isOk()).toBe(true);
    if (!irResult.isOk()) return;
    const ir = irResult.value;
    const docResult = await emitOpenApi(ir, {
      distDir: '/tmp/generated',
      tsconfigPath,
      requestValidator,
    });
    expect(docResult.isOk()).toBe(true);
    if (!docResult.isOk()) return;
    const doc = docResult.value;

    const postOp = doc.paths['/users']?.[postKey];
    expect(postOp).toBeDefined();
    const responses = postOp?.[responsesKey];
    expect(responses).toBeDefined();
    const responsesMap = responses as Record<string, unknown>;
    const statusKey = '400';
    expect(responsesMap[statusKey]).toBeDefined();
  });

  it('registers CreateUserBody schema referenced via $ref in requestBody', async () => {
    const project = createProject({
      tsConfigFilePath: tsconfigPath,
      controllerFiles: [fixturePath],
    });
    const irResult = analyzeControllers(project, [
      { filePath: fixturePath, exportName: 'UserController' },
    ]);
    expect(irResult.isOk()).toBe(true);
    if (!irResult.isOk()) return;
    const ir = irResult.value;
    const docResult = await emitOpenApi(ir, {
      distDir: '/tmp/generated',
      tsconfigPath,
      requestValidator,
    });
    expect(docResult.isOk()).toBe(true);
    if (!docResult.isOk()) return;
    const doc = docResult.value;

    const schemaKey = 'CreateUserBody';
    expect(doc.components.schemas[schemaKey]).toBeDefined();
  });

  it('registers User schema for ts-named response type', async () => {
    const project = createProject({
      tsConfigFilePath: tsconfigPath,
      controllerFiles: [fixturePath],
    });
    const irResult = analyzeControllers(project, [
      { filePath: fixturePath, exportName: 'UserController' },
    ]);
    expect(irResult.isOk()).toBe(true);
    if (!irResult.isOk()) return;
    const ir = irResult.value;
    const docResult = await emitOpenApi(ir, {
      distDir: '/tmp/generated',
      tsconfigPath,
      requestValidator,
    });
    expect(docResult.isOk()).toBe(true);
    if (!docResult.isOk()) return;
    const doc = docResult.value;

    const schemaKey = 'User';
    expect(doc.components.schemas[schemaKey]).toBeDefined();
  });

  it('emits path parameters for routes with pathParam()', async () => {
    const project = createProject({
      tsConfigFilePath: tsconfigPath,
      controllerFiles: [fixturePath],
    });
    const irResult = analyzeControllers(project, [
      { filePath: fixturePath, exportName: 'UserController' },
    ]);
    expect(irResult.isOk()).toBe(true);
    if (!irResult.isOk()) return;
    const ir = irResult.value;
    const docResult = await emitOpenApi(ir, {
      distDir: '/tmp/generated',
      tsconfigPath,
      requestValidator,
    });
    expect(docResult.isOk()).toBe(true);
    if (!docResult.isOk()) return;
    const doc = docResult.value;

    const getOp = doc.paths['/users/{id}']?.[getKey];
    expect(getOp?.[parametersKey]).toEqual([
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ]);
  });

  it('emits multipart/form-data content-type for form target', async () => {
    const project = createProject({
      tsConfigFilePath: tsconfigPath,
      controllerFiles: [uploadFixturePath],
    });
    const irResult = analyzeControllers(project, [
      { filePath: uploadFixturePath, exportName: 'UploadController' },
    ]);
    expect(irResult.isOk()).toBe(true);
    if (!irResult.isOk()) return;
    const ir = irResult.value;
    const docResult = await emitOpenApi(ir, {
      distDir: '/tmp/generated',
      tsconfigPath,
      requestValidator,
    });
    expect(docResult.isOk()).toBe(true);
    if (!docResult.isOk()) return;
    const doc = docResult.value;

    const postOp = doc.paths['/upload']?.[postKey];
    expect(postOp).toBeDefined();
    const requestBody = postOp?.['requestBody'] as Record<string, unknown>;
    expect(requestBody).toBeDefined();
    const content = requestBody['content'] as Record<string, unknown>;
    expect(content['multipart/form-data']).toBeDefined();
    expect(content['application/json']).toBeUndefined();
  });
});
