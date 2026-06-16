import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ControllerClass } from '@zeltjs/core';
import { generateHttpInvocationModule } from '@zeltjs/core/http-invocation';

import type { ZeltConfig } from './config/config.types';

export type GenerateHttpInvocationArtifactsOptions = {
  readonly cwd: string;
  readonly config: ZeltConfig;
  readonly loadStaticApp: () => Promise<object>;
  readonly tsconfig?: string;
  readonly runtime?: HttpInvocationArtifactRuntime;
};

export type GenerateHttpInvocationArtifactsResult = {
  readonly registryPath: string;
  readonly hookModulePath: string;
  readonly artifactHash: string | undefined;
  readonly controllersHash: string | undefined;
  readonly hookModuleChanged: boolean;
  readonly registryChanged: boolean;
};

type HttpArtifactInput = {
  readonly controllers: readonly ControllerClass[];
  readonly metadata: unknown;
};

type HttpInvocationArtifactRuntime =
  | {
      kind: 'typescript';
    }
  | {
      kind: 'node';
    };

type ResolvedArtifactRuntime = {
  readonly sourceModuleFileName: string;
  readonly hookModuleFileName: string;
  readonly moduleSpecifierMode: 'typescript' | 'node';
  readonly moduleSyntax: 'typescript' | 'javascript';
  readonly bundle: boolean;
};

type UnknownFunction = (...args: unknown[]) => unknown;

const resolveArtifactRuntime = (
  runtime: HttpInvocationArtifactRuntime | undefined,
): ResolvedArtifactRuntime => {
  if (runtime?.kind === 'node') {
    return {
      sourceModuleFileName: 'http-invocation.mts',
      hookModuleFileName: 'http-invocation.mjs',
      moduleSpecifierMode: 'typescript',
      moduleSyntax: 'typescript',
      bundle: true,
    };
  }
  return {
    sourceModuleFileName: 'http-invocation.ts',
    hookModuleFileName: 'http-invocation.ts',
    moduleSpecifierMode: 'typescript',
    moduleSyntax: 'typescript',
    bundle: false,
  };
};

const readObject = (value: unknown): object | undefined =>
  typeof value === 'object' && value !== null ? value : undefined;

const readProperty = (value: unknown, key: string): unknown => {
  const object = readObject(value);
  const property: unknown = object === undefined ? undefined : Reflect.get(object, key);
  return property;
};

const readFunctionProperty = (value: unknown, key: string): UnknownFunction | undefined => {
  const property = readProperty(value, key);
  return typeof property === 'function' ? property : undefined;
};

const readControllers = (http: object | undefined): readonly ControllerClass[] => {
  if (http === undefined) return [];
  const getControllers = readFunctionProperty(http, 'getControllers');
  if (getControllers === undefined) return [];
  const controllers: unknown = Reflect.apply(getControllers, http, []);
  return Array.isArray(controllers) ? Array.from<ControllerClass>(controllers) : [];
};

const readMetadata = (http: object | undefined): unknown => {
  if (http === undefined) return undefined;
  const getMetadata = readFunctionProperty(http, 'getMetadata');
  return getMetadata === undefined ? undefined : Reflect.apply(getMetadata, http, []);
};

const readHttpArtifactInput = (app: object): HttpArtifactInput => {
  const http = readObject(readProperty(app, 'http'));
  return {
    controllers: readControllers(http),
    metadata: readMetadata(http),
  };
};

const hashText = (text: string): string => createHash('sha256').update(text).digest('hex');

const writeIfChanged = async (path: string, content: string): Promise<boolean> => {
  if (existsSync(path)) {
    const existing = await readFile(path, 'utf8');
    if (existing === content) return false;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
  return true;
};

const requireFromCli = createRequire(import.meta.url);

const resolvePackageImport = (specifier: string): string =>
  pathToFileURL(requireFromCli.resolve(specifier)).href;

const resolveTsdownBin = (cwd: string): string => {
  const localBin = resolve(cwd, 'node_modules/.bin/tsdown');
  return existsSync(localBin)
    ? localBin
    : resolve(import.meta.dirname, '../../..', 'node_modules/.bin/tsdown');
};

const bundleHookArtifact = async (input: {
  readonly cwd: string;
  readonly entry: string;
  readonly outDir: string;
}): Promise<void> => {
  const tsdownBin = resolveTsdownBin(input.cwd);
  const configPath = join(input.outDir, 'http-invocation.tsdown.config.mjs');
  const configSource = [
    `import swc from ${JSON.stringify(resolvePackageImport('@rollup/plugin-swc'))};`,
    `import { defineConfig } from ${JSON.stringify(resolvePackageImport('tsdown'))};`,
    '',
    'const swcDecoratorPlugin = swc({',
    '  jsc: {',
    "    parser: { syntax: 'typescript', decorators: true },",
    "    transform: { decoratorVersion: '2022-03' },",
    '  },',
    '});',
    '',
    'export default defineConfig({',
    '  plugins: [swcDecoratorPlugin],',
    `  entry: [${JSON.stringify(input.entry)}],`,
    `  outDir: ${JSON.stringify(input.outDir)},`,
    "  format: ['esm'],",
    "  platform: 'node',",
    '  clean: false,',
    '  dts: false,',
    '  deps: { neverBundle: [/^[^./]/] },',
    '});',
    '',
  ].join('\n');
  await writeIfChanged(configPath, configSource);
  const args = ['--config', configPath];

  const exitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
    const child = spawn(tsdownBin, args, { cwd: input.cwd, stdio: 'inherit' });
    child.on('close', (code) => {
      resolvePromise(code ?? 0);
    });
    child.on('error', (error) => {
      rejectPromise(error);
    });
  });

  if (exitCode !== 0) {
    throw new Error(`Failed to bundle HTTP invocation artifact with tsdown: exit ${exitCode}`);
  }
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  const object = readObject(value);
  if (object !== undefined) {
    const entries = Object.entries(object)
      .filter(([, entryValue]) => typeof entryValue !== 'function')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`);
    return `{${entries.join(',')}}`;
  }
  if (typeof value === 'symbol') return JSON.stringify(String(value));
  if (typeof value === 'undefined') return '"__undefined__"';
  return JSON.stringify(value);
};

const buildControllersHash = (
  controllers: readonly ControllerClass[],
  metadata: unknown,
  artifactHash: string,
): string =>
  hashText(
    stableJson({
      controllers: controllers.map((controller) => controller.name),
      metadata,
      artifactHash,
    }),
  );

const renderRegistry = (input: {
  readonly artifactHash: string | undefined;
  readonly controllersHash: string | undefined;
  readonly generatedAt: string;
  readonly hookModuleFileName: string;
}): string => {
  const httpInvocation =
    input.artifactHash === undefined || input.controllersHash === undefined
      ? []
      : [
          '  httpInvocation: {',
          '    version: 1,',
          `    module: new URL('./${input.hookModuleFileName}', import.meta.url).href,`,
          `    artifactHash: '${input.artifactHash}',`,
          `    generatedAt: '${input.generatedAt}',`,
          `    controllersHash: '${input.controllersHash}',`,
          '  },',
        ];

  return ['export const zeltRegistry = {', '  version: 1,', ...httpInvocation, '};', ''].join('\n');
};

export type InvalidateHttpInvocationArtifactsOptions = {
  readonly cwd: string;
};

export const invalidateHttpInvocationArtifacts = async (
  options: InvalidateHttpInvocationArtifactsOptions,
): Promise<void> => {
  await rm(resolve(options.cwd, '.zelt/registry.mjs'), { force: true });
};

const generateHookArtifact = async (input: {
  readonly cwd: string;
  readonly controllers: readonly ControllerClass[];
  readonly metadata: unknown;
  readonly sourceModulePath: string;
  readonly hookModulePath: string;
  readonly tsconfig: string;
  readonly artifactRuntime: ResolvedArtifactRuntime;
}): Promise<{
  readonly artifactHash: string;
  readonly controllersHash: string;
  readonly hookModuleChanged: boolean;
}> => {
  const result = await generateHttpInvocationModule({
    controllers: input.controllers,
    tsconfig: input.tsconfig,
    out: input.sourceModulePath,
    coreImport: '@zeltjs/core/http-invocation-runtime',
    moduleSpecifierMode: input.artifactRuntime.moduleSpecifierMode,
    moduleSyntax: input.artifactRuntime.moduleSyntax,
  });
  if (input.artifactRuntime.bundle) {
    await bundleHookArtifact({
      cwd: input.cwd,
      entry: input.sourceModulePath,
      outDir: dirname(input.hookModulePath),
    });
  }
  const hookModuleSource = await readFile(input.hookModulePath, 'utf8');
  const artifactHash = hashText(hookModuleSource);
  return {
    artifactHash,
    controllersHash: buildControllersHash(input.controllers, input.metadata, artifactHash),
    hookModuleChanged: result.changed,
  };
};

const writeRegistry = async (input: {
  readonly registryPath: string;
  readonly artifactHash: string | undefined;
  readonly controllersHash: string | undefined;
  readonly hookModuleFileName: string;
}): Promise<boolean> =>
  writeIfChanged(
    input.registryPath,
    renderRegistry({
      artifactHash: input.artifactHash,
      controllersHash: input.controllersHash,
      generatedAt: new Date().toISOString(),
      hookModuleFileName: input.hookModuleFileName,
    }),
  );

/** @throws {Error} from HTTP invocation generation or filesystem writes. */
export const generateHttpInvocationArtifacts = async (
  options: GenerateHttpInvocationArtifactsOptions,
): Promise<GenerateHttpInvocationArtifactsResult> => {
  const artifactDir = resolve(options.cwd, '.zelt');
  const artifactRuntime = resolveArtifactRuntime(options.runtime);
  const sourceModulePath = join(artifactDir, artifactRuntime.sourceModuleFileName);
  const hookModulePath = join(artifactDir, artifactRuntime.hookModuleFileName);
  const registryPath = join(artifactDir, 'registry.mjs');

  let hookModuleChanged = false;
  let artifactHash: string | undefined;
  let controllersHash: string | undefined;

  try {
    const staticApp = await options.loadStaticApp();
    const input = readHttpArtifactInput(staticApp);

    if (input.controllers.length > 0) {
      const result = await generateHookArtifact({
        cwd: options.cwd,
        controllers: input.controllers,
        metadata: input.metadata,
        sourceModulePath,
        hookModulePath,
        tsconfig: options.tsconfig ?? resolve(options.cwd, 'tsconfig.json'),
        artifactRuntime,
      });
      hookModuleChanged = result.hookModuleChanged;
      artifactHash = result.artifactHash;
      controllersHash = result.controllersHash;
    }

    const registryChanged = await writeRegistry({
      registryPath,
      artifactHash,
      controllersHash,
      hookModuleFileName: artifactRuntime.hookModuleFileName,
    });

    return {
      registryPath,
      hookModulePath,
      artifactHash,
      controllersHash,
      hookModuleChanged,
      registryChanged,
    };
  } catch (error) {
    await invalidateHttpInvocationArtifacts({ cwd: options.cwd });
    throw error;
  }
};
