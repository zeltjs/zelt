import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { isZeltCorruptOutputsLedgerError } from './cli.errors';
import { GENERATED_FILE_HEADER_MARKER, sweepStaleOutputs } from './outputs-ledger.lib';

describe('sweepStaleOutputs', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = join(tmpdir(), `zelt-cli-outputs-ledger-test-${Date.now()}-${Math.random()}`);
    await mkdir(cwd, { recursive: true });
  });

  const ledgerFile = () => join(cwd, '.zelt', 'outputs.json');

  it('writes the ledger with no deletions on a first run with no prior ledger', async () => {
    const outputFile = join(cwd, '.zelt', 'graphql', 'graphql.runtime.ts');
    await mkdir(join(cwd, '.zelt', 'graphql'), { recursive: true });
    await writeFile(outputFile, 'export const x = 1;\n', 'utf8');

    const result = await sweepStaleOutputs(cwd, [outputFile]);

    expect(result).toEqual({ deleted: [], skipped: [] });
    await expect(readFile(ledgerFile(), 'utf8')).resolves.toBe(
      `${JSON.stringify([join('.zelt', 'graphql', 'graphql.runtime.ts')], null, 2)}\n`,
    );
  });

  it('deletes a `.zelt`-internal file that was registered last run but not this run', async () => {
    const staleFile = join(cwd, '.zelt', 'graphql', 'admin.runtime.ts');
    const keptFile = join(cwd, '.zelt', 'graphql', 'storefront.runtime.ts');
    await mkdir(join(cwd, '.zelt', 'graphql'), { recursive: true });
    await writeFile(staleFile, 'export const x = 1;\n', 'utf8');
    await writeFile(keptFile, 'export const x = 1;\n', 'utf8');

    await sweepStaleOutputs(cwd, [staleFile, keptFile]);
    const result = await sweepStaleOutputs(cwd, [keptFile]);

    expect(result.deleted).toEqual([join('.zelt', 'graphql', 'admin.runtime.ts')]);
    expect(result.skipped).toEqual([]);
    await expect(readFile(staleFile, 'utf8')).rejects.toThrow();
    await expect(readFile(keptFile, 'utf8')).resolves.toBe('export const x = 1;\n');
  });

  it('deletes a file outside `.zelt` when it carries the generated-file header marker', async () => {
    const staleFile = join(cwd, 'src', 'generated', 'admin.resolver-checks.ts');
    await mkdir(join(cwd, 'src', 'generated'), { recursive: true });
    await writeFile(staleFile, `// ${GENERATED_FILE_HEADER_MARKER}\nexport {};\n`, 'utf8');

    await sweepStaleOutputs(cwd, [staleFile]);
    const result = await sweepStaleOutputs(cwd, []);

    expect(result.deleted).toEqual([join('src', 'generated', 'admin.resolver-checks.ts')]);
    await expect(readFile(staleFile, 'utf8')).rejects.toThrow();
  });

  it('never deletes a file outside `.zelt` that lacks the generated-file header marker', async () => {
    const handwrittenFile = join(cwd, 'src', 'generated', 'admin.resolver-checks.ts');
    await mkdir(join(cwd, 'src', 'generated'), { recursive: true });
    await writeFile(handwrittenFile, 'export const handwritten = true;\n', 'utf8');

    await sweepStaleOutputs(cwd, [handwrittenFile]);
    const result = await sweepStaleOutputs(cwd, []);

    expect(result.deleted).toEqual([]);
    expect(result.skipped).toEqual([join('src', 'generated', 'admin.resolver-checks.ts')]);
    await expect(readFile(handwrittenFile, 'utf8')).resolves.toBe(
      'export const handwritten = true;\n',
    );
  });

  it('never deletes the ledger file itself or the graphql codegen manifest, even if a stale ledger lists them', async () => {
    const zeltDir = join(cwd, '.zelt');
    await mkdir(zeltDir, { recursive: true });
    await writeFile(join(zeltDir, 'graphql-codegen.json'), '[]\n', 'utf8');
    // Simulate a ledger written before these paths were excluded, so the
    // exclusion has to hold even when they appear as "previously registered".
    await writeFile(
      ledgerFile(),
      `${JSON.stringify([join('.zelt', 'outputs.json'), join('.zelt', 'graphql-codegen.json')], null, 2)}\n`,
      'utf8',
    );

    const result = await sweepStaleOutputs(cwd, []);

    expect(result.deleted).toEqual([]);
    expect(result.skipped).toEqual([]);
    await expect(readFile(join(zeltDir, 'graphql-codegen.json'), 'utf8')).resolves.toBe('[]\n');
  });

  it('produces a deterministic ledger regardless of registration order', async () => {
    const fileA = join(cwd, '.zelt', 'graphql', 'a.runtime.ts');
    const fileB = join(cwd, '.zelt', 'graphql', 'b.runtime.ts');
    await mkdir(join(cwd, '.zelt', 'graphql'), { recursive: true });
    await writeFile(fileA, '', 'utf8');
    await writeFile(fileB, '', 'utf8');

    await sweepStaleOutputs(cwd, [fileB, fileA]);
    const forward = await readFile(ledgerFile(), 'utf8');

    await sweepStaleOutputs(cwd, [fileA, fileB]);
    const reversed = await readFile(ledgerFile(), 'utf8');

    expect(forward).toBe(reversed);
  });

  it('reproduces endpoint removal: a resolver-checks file for a removed endpoint is deleted on the next build', async () => {
    const runtimeFile = join(cwd, '.zelt', 'graphql', 'admin.runtime.ts');
    const resolverChecksFile = join(cwd, 'src', 'generated', 'admin.resolver-checks.ts');
    await mkdir(join(cwd, '.zelt', 'graphql'), { recursive: true });
    await mkdir(join(cwd, 'src', 'generated'), { recursive: true });
    await writeFile(runtimeFile, 'export const graphqlPrebuilt = {};\n', 'utf8');
    await writeFile(resolverChecksFile, `// ${GENERATED_FILE_HEADER_MARKER}\nexport {};\n`, 'utf8');

    // First build: the admin endpoint exists.
    await sweepStaleOutputs(cwd, [runtimeFile, resolverChecksFile]);

    // Second build: the admin endpoint was removed from the app, so neither
    // file is registered anymore.
    const result = await sweepStaleOutputs(cwd, []);

    expect([...result.deleted].sort()).toEqual(
      [
        join('.zelt', 'graphql', 'admin.runtime.ts'),
        join('src', 'generated', 'admin.resolver-checks.ts'),
      ].sort(),
    );
  });

  it('throws ZeltCorruptOutputsLedgerError instead of silently treating a corrupt ledger as empty', async () => {
    await mkdir(join(cwd, '.zelt'), { recursive: true });
    await writeFile(ledgerFile(), '{not valid json', 'utf8');

    await expect(sweepStaleOutputs(cwd, [])).rejects.toSatisfy(isZeltCorruptOutputsLedgerError);
  });
});
