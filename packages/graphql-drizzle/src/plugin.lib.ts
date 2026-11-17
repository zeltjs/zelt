import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BuildContext, ZeltPlugin } from '@zeltjs/cli';
import { GENERATED_FILE_HEADER_MARKER } from '@zeltjs/cli';
import type { HttpStaticCapabilities } from '@zeltjs/core';
import { registrationError } from './registration.lib';
import { renderModels } from './render.lib';
import type { Model } from './schema.types';
import { readSchema } from './schema-adapter.lib';

export type DrizzleGraphqlPluginOptions = {
  readonly schema: string;
  readonly database: {
    readonly module: string;
    readonly export: string;
  };
  readonly out: string;
};

type HttpStaticApp = {
  readonly http: Pick<HttpStaticCapabilities, 'getControllers'>;
};

const importSpecifier = (out: string, module: string): string => {
  const path = relative(dirname(out), module)
    .replaceAll('\\', '/')
    .replace(/\.[cm]?tsx?$/, '');
  return path.startsWith('.') ? path : `./${path}`;
};

/** @throws {Error} A malformed module cannot enter the build pipeline. */
const loadSchema = async (
  context: BuildContext,
  path: string,
): Promise<Record<string, unknown>> => {
  const loaded: unknown = context.loadModule
    ? await context.loadModule(path)
    : await import(pathToFileURL(path).href);
  if (typeof loaded !== 'object' || loaded === null) {
    throw new Error(`Schema module "${path}" must export Drizzle tables and relations.`);
  }
  return Object.fromEntries(Object.entries(loaded));
};

/** @throws {Error} A malformed package.json cannot enter the build pipeline. */
const packageName = async (cwd: string): Promise<string | undefined> => {
  const path = resolve(cwd, 'package.json');
  if (!existsSync(path)) return undefined;
  const manifest: unknown = JSON.parse(await readFile(path, 'utf8'));
  const name: unknown =
    typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'name') : undefined;
  return typeof name === 'string' && name !== '' ? name : undefined;
};

// Resolvers are matched by this string because the app reaches the generated classes through
// the CLI's own module loader. It must not embed a machine's absolute path, yet must tell apart
// generated files of different packages that end up in one app; the package name does that.
const generatedSource = async (cwd: string, out: string): Promise<string> => {
  const path = relative(cwd, out).replaceAll('\\', '/');
  const name = await packageName(cwd);
  return name === undefined ? path : `${name}/${path}`;
};

const writeGenerated = async (out: string, code: string): Promise<void> => {
  // Generated files can be inside src, which the dev server watches.
  if (existsSync(out) && (await readFile(out, 'utf8')) === code) return;
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, code, 'utf8');
};

export const drizzleGraphqlPlugin = (
  options: DrizzleGraphqlPluginOptions,
): ZeltPlugin<HttpStaticApp> => {
  let generated: { readonly models: readonly Model[]; readonly source: string } | undefined;
  return {
    name: 'graphql-drizzle',
    async preBuild(context) {
      generated = undefined;
      const schema = await loadSchema(context, resolve(context.cwd, options.schema));
      const result = readSchema(schema);
      if (result.kind === 'error') throw new Error(result.message);
      const out = resolve(context.cwd, options.out);
      const source = await generatedSource(context.cwd, out);
      const code = renderModels(result.models, {
        schemaImport: importSpecifier(out, resolve(context.cwd, options.schema)),
        databaseImport: importSpecifier(out, resolve(context.cwd, options.database.module)),
        databaseExport: options.database.export,
        source,
        header: `// ${GENERATED_FILE_HEADER_MARKER}`,
      });
      await writeGenerated(out, code);
      context.registerGeneratedFile(out);
      generated = { models: result.models, source };
    },
    async postBuild(context, result) {
      if (!result.success || generated === undefined || generated.models.length === 0) return;
      const app = await context.loadStaticApp();
      const error = registrationError(app.http, generated.models, generated.source);
      if (error) throw new Error(error);
    },
  };
};
