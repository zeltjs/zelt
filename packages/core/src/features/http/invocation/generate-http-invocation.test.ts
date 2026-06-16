import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it } from 'vitest';

import { Controller } from '../routing/controller.decorator';
import { Post } from '../routing/http-method.decorator';
import { body, validated } from '../request/injection';
import { body as customBody } from './_fixtures/custom-core';
import {
  HttpInvocationHook,
  ImportedUserSchema,
  ImportedUserSchema as AliasedUserSchema,
  httpInvocationHooks,
} from './_fixtures/schemas';
import {
  generateHttpInvocationModule,
  renderHttpInvocationModule,
} from './generate-http-invocation.lib';

const tsconfig = resolve(import.meta.dirname, '../../../..', 'tsconfig.json');
const generatedOut = resolve(import.meta.dirname, 'generated-hooks.ts');

export const LocalUserSchema: StandardSchemaV1<unknown, { readonly id: string }> = {
  '~standard': {
    version: 1,
    vendor: 'zelt-test',
    validate: (value) => {
      if (typeof value === 'object' && value !== null && 'id' in value) {
        return { value: { id: String(value.id) } };
      }
      return { issues: [{ message: 'Invalid local user' }] };
    },
    types: undefined,
  },
};

const normalize = (source: string): string => source.replaceAll('\\', '/');
const dynamicTarget = 'form';

describe('renderHttpInvocationModule', () => {
  it('renders body() and body("form") hook code', async () => {
    @Controller('/body')
    class BodyController {
      @Post('/json')
      create(data = body()) {
        return data;
      }

      @Post('/form')
      upload(data = body('form')) {
        return data;
      }
    }

    const source = await renderHttpInvocationModule({
      controllers: [BodyController],
      tsconfig,
      out: generatedOut,
    });

    expect(source).toContain("'POST /body/json BodyController.create': async (ctx) => [");
    expect(source).toContain("ctx.body('json')");
    expect(source).toContain("'POST /body/form BodyController.upload': async (ctx) => [");
    expect(source).toContain("ctx.body('form')");
    expect(source).not.toContain('undefined');
  });

  it('renders imported schema validation with validateBodyAsync import', async () => {
    @Controller('/users')
    class ImportedSchemaController {
      @Post('/')
      create(data = validated(ImportedUserSchema)) {
        return data;
      }
    }

    const source = normalize(
      await renderHttpInvocationModule({
        controllers: [ImportedSchemaController],
        tsconfig,
        out: generatedOut,
      }),
    );

    expect(source).toContain(
      "import { validateBodyAsync } from '@zeltjs/core/http-invocation-runtime';",
    );
    expect(source).toContain(
      "import { ImportedUserSchema } from './_fixtures/schemas';",
    );
    expect(source).toContain(
      "'POST /users ImportedSchemaController.create': async () => [\n    await validateBodyAsync(ImportedUserSchema, 'json'),\n  ],",
    );
  });

  it('renders exported local schema declarations from the controller source file', async () => {
    @Controller('/local-users')
    class LocalSchemaController {
      @Post('/')
      create(data = validated(LocalUserSchema, 'form')) {
        return data;
      }
    }

    const source = normalize(
      await renderHttpInvocationModule({
        controllers: [LocalSchemaController],
        tsconfig,
        out: generatedOut,
      }),
    );

    expect(source).toContain(
      "import { LocalUserSchema } from './generate-http-invocation.test';",
    );
    expect(source).toContain("await validateBodyAsync(LocalUserSchema, 'form')");
  });

  it('renders aliased schema imports using the exported schema name', async () => {
    @Controller('/aliased-users')
    class AliasedSchemaController {
      @Post('/')
      create(data = validated(AliasedUserSchema)) {
        return data;
      }
    }

    const source = normalize(
      await renderHttpInvocationModule({
        controllers: [AliasedSchemaController],
        tsconfig,
        out: generatedOut,
      }),
    );

    expect(source).toContain(
      "import { ImportedUserSchema as AliasedUserSchema } from './_fixtures/schemas';",
    );
    expect(source).toContain("await validateBodyAsync(AliasedUserSchema, 'json')");
  });

  it('aliases schema imports that collide with generated top-level identifiers', async () => {
    @Controller('/collision')
    class CollisionController {
      @Post('/hooks')
      hooks(data = validated(httpInvocationHooks)) {
        return data;
      }

      @Post('/hook-type')
      hookType(data = validated(HttpInvocationHook)) {
        return data;
      }
    }

    const source = normalize(
      await renderHttpInvocationModule({
        controllers: [CollisionController],
        tsconfig,
        out: generatedOut,
      }),
    );

    expect(source).toContain(
      "import { httpInvocationHooks as httpInvocationHooks2, HttpInvocationHook as HttpInvocationHook2 } from './_fixtures/schemas';",
    );
    expect(source).toContain('await validateBodyAsync(httpInvocationHooks2');
    expect(source).toContain('await validateBodyAsync(HttpInvocationHook2');
  });

  it('renders .js suffix for relative schema imports in node module specifier mode', async () => {
    @Controller('/node-mode')
    class NodeModeController {
      @Post('/')
      create(data = validated(ImportedUserSchema)) {
        return data;
      }
    }

    const source = normalize(
      await renderHttpInvocationModule({
        controllers: [NodeModeController],
        tsconfig,
        out: generatedOut,
        moduleSpecifierMode: 'node',
      }),
    );

    expect(source).toContain("import { ImportedUserSchema } from './_fixtures/schemas.js';");
  });

  it('renders executable JavaScript hooks that import local schemas from runtime output', async () => {
    @Controller('/node-local-users')
    class NodeLocalSchemaController {
      @Post('/')
      create(data = validated(LocalUserSchema)) {
        return data;
      }
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'zelt-http-invocation-node-'));
    const artifactDir = join(tempDir, '.zelt');
    const runtimeDir = join(tempDir, 'dist');
    const runtimeCorePath = join(tempDir, 'runtime-core.mjs');
    const out = join(artifactDir, 'http-invocation.mjs');

    try {
      await writeFile(
        runtimeCorePath,
        [
          'export const validateBodyAsync = async (schema) => {',
          "  const result = await schema['~standard'].validate({ id: 'node-runtime' });",
          '  if (result.issues) throw new Error(result.issues[0]?.message ?? "invalid");',
          '  return result.value;',
          '};',
          '',
        ].join('\n'),
      );
      await generateHttpInvocationModule({
        controllers: [NodeLocalSchemaController],
        tsconfig,
        out,
        coreImport: pathToFileURL(runtimeCorePath).href,
        moduleSpecifierMode: 'node',
        moduleSyntax: 'javascript',
        runtimeImportMap: {
          sourceRoot: import.meta.dirname,
          runtimeRoot: runtimeDir,
        },
      });

      await mkdir(runtimeDir, { recursive: true });
      await writeFile(
        join(runtimeDir, 'generate-http-invocation.test.js'),
        [
          'export const LocalUserSchema = {',
          "  '~standard': {",
          "    validate: (value) => ({ value: { id: String(value.id) } }),",
          '  },',
          '};',
          '',
        ].join('\n'),
      );

      const module = (await import(`${pathToFileURL(out).href}?t=${Date.now()}`)) as {
        readonly httpInvocationHooks: Record<string, () => Promise<unknown[]>>;
      };
      const hook = module.httpInvocationHooks[
        'POST /node-local-users NodeLocalSchemaController.create'
      ];
      if (!hook) {
        throw new Error('Generated node executable hook was not found');
      }
      await expect(hook()).resolves.toEqual([{ id: 'node-runtime' }]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('fails clearly for non-literal body targets', async () => {
    @Controller('/dynamic-body')
    class DynamicBodyTargetController {
      @Post('/')
      create(data = body(dynamicTarget)) {
        return data;
      }
    }

    await expect(
      renderHttpInvocationModule({
        controllers: [DynamicBodyTargetController],
        tsconfig,
        out: generatedOut,
      }),
    ).rejects.toThrow(
      'Unsupported HTTP invocation parameter DynamicBodyTargetController.create(data): body() target must be a string literal',
    );
  });

  it('fails clearly for non-literal validated targets', async () => {
    @Controller('/dynamic-validated')
    class DynamicValidatedTargetController {
      @Post('/')
      create(data = validated(ImportedUserSchema, dynamicTarget)) {
        return data;
      }
    }

    await expect(
      renderHttpInvocationModule({
        controllers: [DynamicValidatedTargetController],
        tsconfig,
        out: generatedOut,
      }),
    ).rejects.toThrow(
      'Unsupported HTTP invocation parameter DynamicValidatedTargetController.create(data): validated() target must be a string literal',
    );
  });

  it('does not treat coreImport as a controller helper source', async () => {
    @Controller('/custom-core')
    class CustomCoreImportController {
      @Post('/')
      create(data = customBody()) {
        return data;
      }
    }

    const source = await renderHttpInvocationModule({
      controllers: [CustomCoreImportController],
      tsconfig,
      out: generatedOut,
      coreImport: './_fixtures/custom-core',
    });

    expect(source).not.toContain('CustomCoreImportController.create');
  });

  it('fails clearly when supported injection params are mixed with unsupported params', async () => {
    @Controller('/mixed')
    class MixedParamController {
      @Post('/')
      create(data = body(), plain: string) {
        return { data, plain };
      }
    }

    await expect(
      renderHttpInvocationModule({
        controllers: [MixedParamController],
        tsconfig,
        out: generatedOut,
      }),
    ).rejects.toThrow(
      'Unsupported HTTP invocation parameter MixedParamController.create(plain): cannot safely generate a hook for this method because another parameter uses a supported HTTP injection helper',
    );
  });

  it('fails clearly for validated(makeSchema())', async () => {
    @Controller('/invalid')
    class InvalidSchemaController {
      @Post('/')
      create(data = validated(makeInvalidSchema())) {
        return data;
      }
    }

    await expect(
      renderHttpInvocationModule({
        controllers: [InvalidSchemaController],
        tsconfig,
        out: generatedOut,
      }),
    ).rejects.toThrow(
      'Unsupported HTTP invocation parameter InvalidSchemaController.create(data): validated() requires an imported or exported schema identifier',
    );
  });

  it('writes generated modules only when content changes and generated body hook is executable', async () => {
    @Controller('/exec')
    class ExecutableController {
      @Post('/')
      create(data = body('text')) {
        return data;
      }
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'zelt-http-invocation-'));
    const out = join(tempDir, 'http-invocation.ts');
    try {
      await expect(
        generateHttpInvocationModule({ controllers: [ExecutableController], tsconfig, out }),
      ).resolves.toEqual({ changed: true });
      await expect(
        generateHttpInvocationModule({ controllers: [ExecutableController], tsconfig, out }),
      ).resolves.toEqual({ changed: false });

      const generated = await readFile(out, 'utf8');
      const executable = generated
        .replace(/type HttpInvocationHookContext[\\s\\S]*?;\\n\\n/, '')
        .replace(/type HttpInvocationHook[\\s\\S]*?;\\n\\n/, '')
        .replace(/ satisfies Readonly<Record<string, HttpInvocationHook>>/, '');
      const executablePath = join(dirname(out), 'http-invocation.mjs');
      await writeFile(executablePath, executable, 'utf8');

      const module = (await import(`${pathToFileURL(executablePath).href}?t=${Date.now()}`)) as {
        readonly httpInvocationHooks: Record<
          string,
          (ctx: { body: (type: string) => unknown }) => Promise<unknown[]>
        >;
      };
      const hook = module.httpInvocationHooks['POST /exec ExecutableController.create'];
      if (!hook) {
        throw new Error('Generated executable hook was not found');
      }
      await expect(hook({ body: (type) => `parsed:${type}` })).resolves.toEqual(['parsed:text']);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

const makeInvalidSchema = (): StandardSchemaV1<unknown, { readonly name: string }> =>
  ImportedUserSchema;
