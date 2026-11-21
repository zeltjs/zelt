import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export type GuideFile = { readonly name: string; readonly content: string };

// Splits a block at Twoslash's own `// @filename:` lines. Cut markers stay in the files: they
// only hide lines from the rendered page, and the program keeps them as comments.
const FILENAME = /^[\t\v\f ]*\/\/\s?@filename: (.+)$/gm;

export const virtualFiles = (block: string): readonly GuideFile[] => {
  const markers = [...block.matchAll(FILENAME)];
  return markers.map((marker, index) => {
    const start = (marker.index ?? 0) + marker[0].length;
    const body = block.slice(start, markers[index + 1]?.index ?? block.length);
    return { name: (marker[1] ?? '').trim(), content: body.replace(/^\r?\n/, '') };
  });
};

const tsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    skipLibCheck: true,
  },
  include: ['**/*.ts'],
};

export const writeProject = async (dir: string, files: readonly GuideFile[]): Promise<void> => {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify(tsconfig));
  for (const file of files) {
    await mkdir(dirname(join(dir, file.name)), { recursive: true });
    await writeFile(join(dir, file.name), file.content);
  }
};

export const importModule = async (path: string): Promise<Record<string, unknown>> => {
  const loaded: unknown = await import(pathToFileURL(path).href);
  return typeof loaded === 'object' && loaded !== null
    ? Object.fromEntries(Object.entries(loaded))
    : {};
};
