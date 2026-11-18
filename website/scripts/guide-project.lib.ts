import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export type GuideFile = { readonly name: string; readonly content: string };

// Twoslash cut markers only hide lines from the rendered page; the program keeps them.
export const virtualFiles = (block: string): readonly GuideFile[] =>
  block
    .split(/^\/\/ @filename:\s*/m)
    .slice(1)
    .map((part) => {
      const [name = '', ...lines] = part.split('\n');
      const content = lines.filter((line) => !/^\/\/ ---cut(-after)?---$/.test(line)).join('\n');
      return { name: name.trim(), content };
    });

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
