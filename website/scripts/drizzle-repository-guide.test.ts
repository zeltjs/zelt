import { cp, readdir, readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { drizzleRepositoryPlugin } from '@zeltjs/drizzle-repository';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { twoslashBlocks, visibleCode } from '../src/twoslash/code-blocks.lib';
import { importModule } from './guide-project.lib';
import { createReadCodeBlocks } from './markdown-code.lib';

// The guide's blocks are type-checked against an app whose repositories and models are committed
// generator output. This test runs the real generator on that app's schema and checks that the
// committed output is what the generator produces now. UPDATE_GENERATED=1 rewrites it.
const websiteDir = join(import.meta.dirname, '..');
const fixtureDir = join(websiteDir, 'src/twoslash/fixtures/drizzle-repository');
const workDir = join(websiteDir, '.generated/drizzle-repository-guide');
const guides = {
  en: join(websiteDir, 'docs/drizzle-repository.md'),
  ja: join(websiteDir, 'i18n/ja/docusaurus-plugin-content-docs/current/drizzle-repository.md'),
};
const generatedDirs = ['src/domain/generated', 'src/db/generated'];

const listFiles = async (dir: string): Promise<readonly string[]> =>
  (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();

const generate = async (): Promise<void> => {
  await rm(workDir, { recursive: true, force: true });
  await cp(join(fixtureDir, 'src/db'), join(workDir, 'src/db'), {
    recursive: true,
    filter: (source) => !source.includes('/generated'),
  });
  const plugin = drizzleRepositoryPlugin({
    schema: './src/db/schema.ts',
    database: { from: './src/db/drizzle.service.ts', name: 'DrizzleService' },
    out: { model: './src/domain/generated', repository: './src/db/generated' },
  });
  await plugin.preBuild?.({
    cwd: workDir,
    build: {},
    loadModule: importModule,
    loadStaticApp: async () => ({}),
    registerGeneratedFile: () => {},
  });
};

// Comparing tokens keeps formatting, comments and quote style out of the comparison.
const tokens = (code: string): string => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, code);
  const result: string[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    result.push(
      kind === ts.SyntaxKind.StringLiteral
        ? JSON.stringify(scanner.getTokenValue())
        : scanner.getTokenText(),
    );
  }
  return result.join(' ');
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

  const readCodeBlocks = createReadCodeBlocks();

  it.each(Object.entries(guides))(
    '%s: the shown schema is the schema of the app',
    async (_, guide) => {
      const blocks = twoslashBlocks(await readCodeBlocks(guide, await readFile(guide, 'utf8')));
      const schemaBlock = blocks.find(({ code }) => code.includes('// src/db/schema.ts'));
      if (schemaBlock === undefined) throw new Error('The guide has no src/db/schema.ts block');
      const shown = visibleCode(schemaBlock.code)
        .split('\n')
        .filter((line) => !line.startsWith('import '))
        .join('\n');
      const appSchema = await readFile(join(fixtureDir, 'src/db/schema.ts'), 'utf8');
      expect(tokens(appSchema)).toContain(tokens(shown));
    },
  );
});
