import { cp, readdir, readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { ZeltConfig } from '@zeltjs/cli';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { visibleCode } from '../src/twoslash/code-blocks.lib';
import { importModule } from './guide-project.lib';
import { createReadCodeBlocks } from './markdown-code.lib';

// The README of the package and the guide show excerpts of one app: its schema and config, and
// code that uses the repositories and models the real generator wrote from that schema. This test
// runs the generator from the app's own config and checks that the committed output is what the
// generator produces now (UPDATE_GENERATED=1 rewrites it), type-checks the app, and checks that
// each code block is an excerpt of the file it names: with `source=`, or for a Twoslash block of
// the guide, with the `// @filename:` it is placed at.
const websiteDir = join(import.meta.dirname, '..');
const repoDir = join(websiteDir, '..');
const fixtureDir = join(websiteDir, 'src/twoslash/fixtures/drizzle-repository');
const workDir = join(websiteDir, '.generated/drizzle-repository-guide');
const docs = {
  README: join(repoDir, 'packages/drizzle-repository/README.md'),
  en: join(websiteDir, 'docs/drizzle-repository.md'),
  ja: join(websiteDir, 'i18n/ja/docusaurus-plugin-content-docs/current/drizzle-repository.md'),
};
const generatedDirs = ['src/domain/generated', 'src/db/generated'];

const listFiles = async (dir: string): Promise<readonly string[]> =>
  (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();

function asConfig(value: unknown): ZeltConfig;
function asConfig(value: unknown): unknown {
  if (typeof value !== 'object' || value === null)
    throw new Error('zelt.config.ts has no default export');
  return value;
}

const generate = async (): Promise<void> => {
  await rm(workDir, { recursive: true, force: true });
  await cp(join(fixtureDir, 'src/db'), join(workDir, 'src/db'), {
    recursive: true,
    filter: (source) => !source.includes('/generated'),
  });
  const config = asConfig((await importModule(join(fixtureDir, 'zelt.config.ts')))['default']);
  const plugin = config.plugins?.find((candidate) => candidate.name === 'drizzle-repository');
  if (plugin?.preBuild === undefined) throw new Error('zelt.config.ts has no repository plugin');
  await plugin.preBuild({
    cwd: workDir,
    build: {},
    loadModule: importModule,
    loadStaticApp: async () => ({}),
    registerGeneratedFile: () => {},
  });
};

const typeErrors = (project: string): string => {
  const host = {
    getCanonicalFileName: (name: string) => name,
    getCurrentDirectory: () => project,
    getNewLine: () => '\n',
  };
  const config = ts.getParsedCommandLineOfConfigFile(join(project, 'tsconfig.json'), undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.formatDiagnostic(diagnostic, host));
    },
  });
  if (config === undefined) throw new Error(`${project}/tsconfig.json cannot be read`);
  const program = ts.createProgram(config.fileNames, config.options);
  return ts.formatDiagnostics([...config.errors, ...ts.getPreEmitDiagnostics(program)], host);
};

// Comparing tokens keeps formatting, comments and quote style out of the comparison. A string
// literal is compared by its kind only, so each translation can write its text in its language.
const tokens = (code: string): readonly string[] => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, code);
  const result: string[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    result.push(kind === ts.SyntaxKind.StringLiteral ? '<string>' : scanner.getTokenText());
  }
  return result;
};

const isExcerpt = (file: readonly string[], block: readonly string[]): boolean =>
  block.length > 0 &&
  file.some((_, start) => block.every((token, index) => file[start + index] === token));

const typescript = new Set(['ts', 'typescript', 'tsx']);
const SOURCE = /\bsource=(\S+)/;
// A Twoslash block of the guide is placed at a file of the app, which is the file it shows.
const APP_FILE = /^\/\/ @filename: drizzle-repository\/(\S+)$/m;

// The file a block is an excerpt of, and the code the reader sees of it.
const excerptOf = (meta: string | null | undefined, value: string) => {
  const source = meta?.match(SOURCE)?.[1];
  if (source !== undefined) return { file: join(repoDir, source), shown: value };
  const appFile = value.match(APP_FILE)?.[1];
  if (appFile !== undefined) return { file: join(fixtureDir, appFile), shown: visibleCode(value) };
  return undefined;
};

// No file can hold these blocks: one shows the drizzle() call of both drizzle versions side by
// side, the other the generated methods with placeholders for the names of keys.
const pseudoCode = ['drizzle(connection, { schema });', 'isExisted(id: UserId):'];

const readCodeBlocks = createReadCodeBlocks();

const mismatchesOf = async (doc: string): Promise<readonly string[]> => {
  const blocks = await readCodeBlocks(doc, await readFile(doc, 'utf8'));
  const mismatches: string[] = [];
  for (const { lang, meta, value } of blocks) {
    if (!typescript.has(lang ?? '')) continue;
    const excerpt = excerptOf(meta, value);
    if (excerpt === undefined) {
      if (!pseudoCode.some((line) => value.includes(line))) mismatches.push(`no source\n${value}`);
      continue;
    }
    // An import only tells where a name comes from; the file may import more names, in any order.
    const shown = excerpt.shown
      .split('\n')
      .filter((line) => !line.startsWith('import '))
      .join('\n');
    const file = await readFile(excerpt.file, 'utf8');
    if (!isExcerpt(tokens(file), tokens(shown)))
      mismatches.push(`not in ${relative(repoDir, excerpt.file)}\n${excerpt.shown}`);
  }
  return mismatches;
};

describe('drizzle-repository guide', () => {
  it('shows repositories generated from the schema of its app', async () => {
    await generate();
    for (const dir of generatedDirs) {
      const actualDir = join(workDir, dir);
      const committedDir = join(fixtureDir, dir);
      if (process.env['UPDATE_GENERATED'] === '1') {
        await rm(committedDir, { recursive: true, force: true });
        await cp(actualDir, committedDir, { recursive: true });
      }
      const files = await listFiles(actualDir);
      expect(await listFiles(committedDir)).toEqual(files);
      for (const file of files) {
        expect(await readFile(join(committedDir, file), 'utf8')).toBe(
          await readFile(join(actualDir, file), 'utf8'),
        );
      }
    }
  }, 60_000);

  it('type-checks its app', () => {
    expect(typeErrors(fixtureDir)).toBe('');
  }, 60_000);

  it.each(Object.entries(docs))(
    '%s: every code block is an excerpt of a file of a tested app',
    async (_, doc) => {
      expect(await mismatchesOf(doc)).toEqual([]);
    },
  );
});
