import type { HttpInvocationHook } from './routing';

export type LoadHttpInvocationHooksOptions = {
  readonly cwd?: string;
};

type NodeProcess = {
  readonly cwd: () => string | undefined;
};

type HttpInvocationRegistryEntry = {
  version: 1;
  readonly module: string;
  readonly artifactHash: string;
};

type ZeltRegistry = {
  version: 1;
  readonly httpInvocation?: HttpInvocationRegistryEntry;
};

type NodeModules = {
  readonly existsSync: (path: string) => boolean;
  readonly readFile: (path: string, encoding: 'utf8') => Promise<string>;
  readonly hashText: (text: string) => string;
  readonly resolve: (...paths: readonly string[]) => string;
  readonly pathToFileURL: (path: string) => URL;
  readonly fileURLToPath: (url: string | URL) => string;
};

type UnknownFunction = (...args: unknown[]) => unknown;

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

const readRequiredObject = (value: unknown, message: string): object => {
  const object = readObject(value);
  if (object === undefined) throw new Error(message);
  return object;
};

const readRequiredStringProperty = (value: object, key: string, message: string): string => {
  const property: unknown = Reflect.get(value, key);
  if (typeof property !== 'string') throw new Error(message);
  return property;
};

const getNodeProcess = (): NodeProcess | undefined => {
  const processObject = readObject(readProperty(globalThis, 'process'));
  const versions = readObject(readProperty(processObject, 'versions'));
  const cwd = readFunctionProperty(processObject, 'cwd');

  if (typeof readProperty(versions, 'node') !== 'string' || cwd === undefined) {
    return undefined;
  }

  return {
    cwd: () => {
      const value: unknown = Reflect.apply(cwd, processObject, []);
      return typeof value === 'string' ? value : undefined;
    },
  };
};

const readHttpInvocationEntry = (value: unknown): HttpInvocationRegistryEntry => {
  const entry = readRequiredObject(value, '.zelt registry httpInvocation must be an object.');
  const version: unknown = Reflect.get(entry, 'version');
  if (version !== 1) {
    throw new Error(`Unsupported HTTP invocation artifact version ${String(version)}; expected 1.`);
  }
  return {
    version: 1,
    module: readRequiredStringProperty(
      entry,
      'module',
      '.zelt registry httpInvocation.module must be a string URL.',
    ),
    artifactHash: readRequiredStringProperty(
      entry,
      'artifactHash',
      '.zelt registry httpInvocation.artifactHash must be a string.',
    ),
  };
};

const readRegistry = (value: unknown): ZeltRegistry => {
  const registry = readRequiredObject(
    value,
    '.zelt registry must export zeltRegistry as an object.',
  );
  const version: unknown = Reflect.get(registry, 'version');
  if (version !== 1) {
    throw new Error(`Unsupported .zelt registry version ${String(version)}; expected 1.`);
  }

  const httpInvocation: unknown = Reflect.get(registry, 'httpInvocation');
  return httpInvocation === undefined
    ? { version: 1 }
    : { version: 1, httpInvocation: readHttpInvocationEntry(httpInvocation) };
};

const toHttpInvocationHook = (
  hook: UnknownFunction,
  moduleUrl: string,
  key: string,
): HttpInvocationHook => {
  return async (ctx) => {
    const result: unknown = await Reflect.apply(hook, undefined, [ctx]);
    if (!Array.isArray(result)) {
      throw new Error(`HTTP invocation hook "${key}" from ${moduleUrl} must return an array.`);
    }
    return Array.from<unknown>(result);
  };
};

const readHooks = (
  value: unknown,
  moduleUrl: string,
): Readonly<Record<string, HttpInvocationHook>> => {
  const moduleObject = readRequiredObject(
    value,
    `HTTP invocation module ${moduleUrl} must export httpInvocationHooks.`,
  );
  const hooksObject = readRequiredObject(
    readProperty(moduleObject, 'httpInvocationHooks'),
    `HTTP invocation module ${moduleUrl} must export httpInvocationHooks.`,
  );

  const hooks: Record<string, HttpInvocationHook> = {};
  for (const key of Object.keys(hooksObject)) {
    const hook: unknown = Reflect.get(hooksObject, key);
    if (typeof hook !== 'function') {
      throw new Error(`HTTP invocation hook "${key}" from ${moduleUrl} must be a function.`);
    }
    hooks[key] = toHttpInvocationHook(hook, moduleUrl, key);
  }
  return hooks;
};

const toFilePath = (moduleUrl: string, fileURLToPath: (url: string | URL) => string): string => {
  let parsed: URL;
  try {
    parsed = new URL(moduleUrl);
  } catch (cause) {
    throw new Error(`HTTP invocation registry module URL is malformed: ${moduleUrl}.`, {
      cause,
    });
  }
  if (parsed.protocol !== 'file:') {
    throw new Error(
      `HTTP invocation artifact hash verification requires a file URL, got ${moduleUrl}.`,
    );
  }
  return fileURLToPath(parsed);
};

const loadNodeModules = async (): Promise<NodeModules> => {
  const [
    { existsSync },
    { readFile },
    { createHash },
    { resolve },
    { pathToFileURL, fileURLToPath },
  ] = await Promise.all([
    import('node:fs'),
    import('node:fs/promises'),
    import('node:crypto'),
    import('node:path'),
    import('node:url'),
  ]);

  return {
    existsSync,
    readFile,
    hashText: (text) => createHash('sha256').update(text).digest('hex'),
    resolve,
    pathToFileURL,
    fileURLToPath,
  };
};

const loadRegistry = async (registryPath: string, modules: NodeModules): Promise<ZeltRegistry> => {
  const registryUrl = modules.pathToFileURL(registryPath).href;
  let registryModule: unknown;
  try {
    registryModule = await import(registryUrl);
  } catch (cause) {
    throw new Error(`Failed to load .zelt registry at ${registryPath}.`, { cause });
  }
  return readRegistry(readProperty(registryModule, 'zeltRegistry'));
};

const verifyArtifact = async (
  entry: HttpInvocationRegistryEntry,
  modules: NodeModules,
): Promise<void> => {
  const modulePath = toFilePath(entry.module, modules.fileURLToPath);
  const artifactSource = await modules.readFile(modulePath, 'utf8');
  const actualArtifactHash = modules.hashText(artifactSource);
  if (actualArtifactHash !== entry.artifactHash) {
    throw new Error(
      `HTTP invocation artifact hash mismatch for ${modulePath}; registry has ${entry.artifactHash}, file has ${actualArtifactHash}.`,
    );
  }
};

const loadHooks = async (
  entry: HttpInvocationRegistryEntry,
): Promise<Readonly<Record<string, HttpInvocationHook>>> => {
  let hooksModule: unknown;
  try {
    hooksModule = await import(entry.module);
  } catch (cause) {
    throw new Error(`Failed to load HTTP invocation hooks from ${entry.module}.`, { cause });
  }
  return readHooks(hooksModule, entry.module);
};

const resolveRegistryPath = (
  options: LoadHttpInvocationHooksOptions,
  processLike: NodeProcess,
  modules: NodeModules,
): string | undefined => {
  const cwd = options.cwd ?? processLike.cwd();
  return cwd === undefined ? undefined : modules.resolve(cwd, '.zelt/registry.mjs');
};

/** @throws {Error} when a present registry is malformed or its hook module cannot be loaded. */
export const loadHttpInvocationHooksFromRegistry = async (
  options: LoadHttpInvocationHooksOptions = {},
): Promise<Readonly<Record<string, HttpInvocationHook>> | undefined> => {
  const processLike = getNodeProcess();
  if (processLike === undefined) return undefined;

  const modules = await loadNodeModules();
  const registryPath = resolveRegistryPath(options, processLike, modules);
  if (registryPath === undefined || !modules.existsSync(registryPath)) return undefined;

  const registry = await loadRegistry(registryPath, modules);
  if (registry.httpInvocation === undefined) return undefined;

  await verifyArtifact(registry.httpInvocation, modules);
  return loadHooks(registry.httpInvocation);
};
