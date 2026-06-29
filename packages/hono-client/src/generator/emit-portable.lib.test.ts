import { resolve } from 'node:path';

import { Controller } from '@zeltjs/core';
import { getOrCreateProgram } from '@zeltjs/decorator-metadata/inspect';
import { describe, expect, it } from 'vitest';
import { PortableDtoController } from './fixtures/portable-dto.controller.fixture';
import type { ControllerClass, HttpMetadata } from './generator.types';
import { PortableAppTypeEmitterService } from './portable-app-type-emitter.service';

@Controller('/users')
export class UserController {
  show(): { id: string; name: string } {
    return { id: '1', name: 'test' };
  }

  create(): { id: string; name: string } {
    return { id: '2', name: 'created' };
  }
}

@Controller('/posts')
export class PostController {
  list(): { title: string }[] {
    return [{ title: 'hello' }];
  }
}

const singleControllerMetadata: HttpMetadata = {
  controllers: [
    {
      basePath: '/users',
      name: 'UserController',
      routes: [
        { method: 'GET', path: '/:id', fullPath: '/users/:id', methodName: 'show' },
        { method: 'POST', path: '/', fullPath: '/users', methodName: 'create' },
      ],
    },
  ],
};

const multiControllerMetadata: HttpMetadata = {
  controllers: [
    {
      basePath: '/users',
      name: 'UserController',
      routes: [{ method: 'GET', path: '/:id', fullPath: '/users/:id', methodName: 'show' }],
    },
    {
      basePath: '/posts',
      name: 'PostController',
      routes: [{ method: 'GET', path: '/', fullPath: '/posts', methodName: 'list' }],
    },
  ],
};

const missingMethodMetadata: HttpMetadata = {
  controllers: [
    {
      basePath: '/users',
      name: 'UserController',
      routes: [
        { method: 'GET', path: '/missing', fullPath: '/users/missing', methodName: 'missing' },
      ],
    },
  ],
};

const distDir = resolve(__dirname, '../../generated');
const tsconfig = resolve(__dirname, '../../tsconfig.json');
const projectRoot = resolve(__dirname, '../..');
const portableTestTimeout = 30_000;

const portableDtoMetadata: HttpMetadata = {
  controllers: [
    {
      basePath: '/portable-dto',
      name: 'PortableDtoController',
      routes: [
        {
          method: 'GET',
          path: '/:id',
          fullPath: '/portable-dto/:id',
          methodName: 'show',
        },
      ],
    },
  ],
};

const expectGeneratedAppTypeToTypeCheck = async (sourceText: string) => {
  const result = await getOrCreateProgram(tsconfig);
  expect(result.isOk()).toBe(true);
  if (result.isErr()) return;

  const { ts, program: baseProgram } = result.value;
  const compilerOptions = baseProgram.getCompilerOptions();
  const fileName = resolve(distDir, 'app-type.ts');
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const host = ts.createCompilerHost(compilerOptions);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);

  host.getSourceFile = (requestedFileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (requestedFileName === fileName) return sourceFile;
    return getSourceFile(requestedFileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  host.fileExists = (requestedFileName) =>
    requestedFileName === fileName || fileExists(requestedFileName);
  host.readFile = (requestedFileName) => {
    if (requestedFileName === fileName) return sourceText;
    return readFile(requestedFileName);
  };

  const generatedProgram = ts.createProgram({
    rootNames: [fileName],
    options: compilerOptions,
    host,
  });
  const diagnostics = [
    ...generatedProgram.getSyntacticDiagnostics(),
    ...generatedProgram.getSemanticDiagnostics(),
  ];
  expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
};

describe('emitPortableAppType', () => {
  const emitter = new PortableAppTypeEmitterService();

  it(
    'generates portable output for GET endpoint',
    async () => {
      const result = await emitter.emit({
        metadata: singleControllerMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain('$get');
      expect(result.value).toContain('/users/:id');
      expect(result.value).toContain('id: string');
      expect(result.value).toContain('name: string');
    },
    portableTestTimeout,
  );

  it(
    'generates portable output for POST endpoint',
    async () => {
      const result = await emitter.emit({
        metadata: singleControllerMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain('$post');
      expect(result.value).toContain('/users');
    },
    portableTestTimeout,
  );

  it(
    'does not contain controller imports',
    async () => {
      const result = await emitter.emit({
        metadata: singleControllerMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).not.toContain('UserController');
      expect(result.value).not.toContain('import type { UserController');
    },
    portableTestTimeout,
  );

  it(
    'uses import() syntax for external hono types',
    async () => {
      const result = await emitter.emit({
        metadata: singleControllerMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain("import('hono').Hono");
      expect(result.value).not.toContain(projectRoot);
    },
    portableTestTimeout,
  );

  it(
    'handles multiple controllers',
    async () => {
      const result = await emitter.emit({
        metadata: multiControllerMetadata,
        controllers: [UserController, PostController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain('/users/:id');
      expect(result.value).toContain('/posts');
      expect(result.value).toContain('$get');
      expect(result.value).toContain('title: string');
    },
    portableTestTimeout,
  );

  it(
    'returns error when emitted AppType has semantic diagnostics',
    async () => {
      const result = await emitter.emit({
        metadata: missingMethodMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.kind).toBe('type_resolution_failed');
      if (result.error.kind !== 'type_resolution_failed') return;
      expect(result.error.message).toContain('missing');
    },
    portableTestTimeout,
  );

  it(
    'generates type-checkable portable output for generic DTOs with imported local DTOs',
    async () => {
      const result = await emitter.emit({
        metadata: portableDtoMetadata,
        controllers: [PortableDtoController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain('/portable-dto/:id');
      expect(result.value).toContain('value:');
      expect(result.value).toContain('bio: string');
      expect(result.value).not.toContain('PortableProfile');
      await expectGeneratedAppTypeToTypeCheck(result.value);
    },
    portableTestTimeout,
  );

  it(
    'includes generated file header',
    async () => {
      const result = await emitter.emit({
        metadata: singleControllerMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig,
        projectRoot,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value).toContain('THIS FILE IS GENERATED');
      expect(result.value).toContain('export type AppType =');
    },
    portableTestTimeout,
  );

  it(
    'returns error for invalid tsconfig',
    async () => {
      const result = await emitter.emit({
        metadata: singleControllerMetadata,
        controllers: [UserController] as readonly ControllerClass[],
        distDir,
        tsconfig: '/nonexistent/tsconfig.json',
        projectRoot,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.kind).toBe('tsconfig_error');
    },
    portableTestTimeout,
  );
});
