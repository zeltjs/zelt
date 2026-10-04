#!/usr/bin/env node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';

import {
  DI_ONLY_CONSUMER_SOURCE,
  findBundledHonoModules,
  findBundledCronerModules,
  findForbiddenSpecifiers,
  findSpecifiers,
} from './tree-shaking-rules.mjs';

const isBareSpecifier = (id) => !id.startsWith('.') && !path.isAbsolute(id) && !id.startsWith('\0');

// 作業ディレクトリを core パッケージの node_modules 配下に置く。bundle 結果を実行するとき、
// external に残った依存（node:* や hono）を core と同じ解決経路で読めるようにするため。
const createWorkDir = async (corePackageDir) => {
  const cacheDir = path.join(corePackageDir, 'node_modules', '.cache');
  await mkdir(cacheDir, { recursive: true });
  return mkdtemp(path.join(cacheDir, 'zelt-tree-shaking-'));
};

export const bundleConsumer = async ({ corePackageDir, workDir, source, externalHono }) => {
  const entry = path.join(workDir, 'entry.mjs');
  await writeFile(entry, source);

  const build = await rolldown({
    input: entry,
    platform: 'node',
    // 実際の利用側 bundle と同じく Hono も取り込む。fixture だけ外部化を指定する。
    external: (id) => isBareSpecifier(id) && (id.startsWith('node:') || (externalHono && /^hono(\/|$)/.test(id))),
    resolve: {
      // dist を直接解決させる。rolldown は解決先から最寄りの package.json の sideEffects を読む。
      alias: { '@zeltjs/core': path.join(corePackageDir, 'dist', 'index.js') },
    },
  });
  try {
    const { output } = await build.generate({ format: 'esm' });
    const code = output
      .filter((chunk) => chunk.type === 'chunk')
      .map((chunk) => chunk.code)
      .join('\n');
    const outputFile = path.join(workDir, 'bundle.mjs');
    await writeFile(outputFile, code);
    return { code, outputFile, honoModules: findBundledHonoModules(output), cronerModules: findBundledCronerModules(output) };
  } finally {
    await build.close();
  }
};

export const verifyTreeShaking = async ({ corePackageDir, source = DI_ONLY_CONSUMER_SOURCE, externalHono = false, allowScheduler = false }) => {
  const workDir = await createWorkDir(corePackageDir);
  try {
    const { code, outputFile, honoModules, cronerModules } = await bundleConsumer({ corePackageDir, workDir, source, externalHono });
    const forbidden = [...findForbiddenSpecifiers(code), ...honoModules, ...(allowScheduler ? [] : cronerModules)];
    const runtimeError =
      forbidden.length > 0
        ? undefined
        : await import(pathToFileURL(outputFile).href).then(
            () => undefined,
            (error) => error,
          );
    return { specifiers: [...findSpecifiers(code), ...honoModules, ...cronerModules], forbidden, runtimeError };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const corePackageDir = path.resolve('packages/core');
  const { specifiers, forbidden, runtimeError } = await verifyTreeShaking({ corePackageDir });

  console.log('Specifiers left in a DI-only bundle of @zeltjs/core:');
  for (const id of specifiers) {
    console.log(`  ${forbidden.includes(id) ? '✗' : '✓'} ${id}`);
  }
  if (forbidden.length > 0) {
    console.error(
      `\n${forbidden.length} unused feature dependency module(s) survived tree shaking. Check internal chunk boundaries and pure initializers.`,
    );
    process.exit(1);
  }
  if (runtimeError) {
    console.error(
      '\nThe DI-only bundle failed at runtime. A module dropped by tree shaking had a side effect the consumer relies on.',
    );
    console.error(runtimeError);
    process.exit(1);
  }
  console.log('\n✓ hono and croner are fully tree-shaken and the DI-only bundle runs.');
}
