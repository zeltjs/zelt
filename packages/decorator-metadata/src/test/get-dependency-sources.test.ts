import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import type { DependencySource } from '../inspect/index';
import { clearProgramCache, getDependencySources } from '../inspect/index';

const tsconfig = resolve(__dirname, '../../tsconfig.json');
const consumerPath = resolve(__dirname, './fixtures/class-source/dep-consumer.ts');
const exportedPath = resolve(__dirname, './fixtures/class-source/exported.ts');
const defaultDepPath = resolve(__dirname, './fixtures/class-source/default-dep.ts');

const byLocalName = (
  deps: readonly DependencySource[],
  localName: string,
): DependencySource | undefined => deps.find((d) => d.localName === localName);

describe('getDependencySources', () => {
  beforeAll(() => {
    clearProgramCache();
  });

  const getConsumerDeps = async () => {
    const result = await getDependencySources(
      { filePath: consumerPath, exportName: 'Consumer' },
      { tsconfig },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) throw new Error('expected ok');
    return result.value;
  };

  it('resolves a named import dependency to its canonical ClassSource', async () => {
    const deps = await getConsumerDeps();
    expect(byLocalName(deps, 'ExportedService')).toEqual({
      kind: 'class',
      localName: 'ExportedService',
      source: { filePath: exportedPath, exportName: 'ExportedService' },
    });
  });

  it('keeps the export name for aliased imports (identity-canonical)', async () => {
    const deps = await getConsumerDeps();
    expect(byLocalName(deps, 'AliasedService')).toEqual({
      kind: 'class',
      localName: 'AliasedService',
      source: { filePath: exportedPath, exportName: 'AliasedService' },
    });
  });

  it('resolves a same-file dependency through its aliased export', async () => {
    const deps = await getConsumerDeps();
    expect(byLocalName(deps, 'LocalDep')).toEqual({
      kind: 'class',
      localName: 'LocalDep',
      source: { filePath: consumerPath, exportName: 'PublicLocalDep' },
    });
  });

  it('resolves a default-import dependency', async () => {
    const deps = await getConsumerDeps();
    expect(byLocalName(deps, 'DefaultDep')).toEqual({
      kind: 'class',
      localName: 'DefaultDep',
      source: { filePath: defaultDepPath, exportName: 'default' },
    });
  });

  it('reports a non-exported same-file dependency as unresolved', async () => {
    const result = await getDependencySources(
      {
        filePath: resolve(__dirname, './fixtures/class-source/unresolved-consumer.ts'),
        exportName: 'UnresolvedConsumer',
      },
      { tsconfig },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const dep = byLocalName(result.value, 'NeverExported');
    expect(dep?.kind).toBe('unresolved');
  });

  it('finds the class through an aliased export name of the target itself', async () => {
    // ClassSource の exportName が実クラス名と違っても(export { Renamed as AliasedService })
    // クラス宣言まで辿って依存を返せること
    const result = await getDependencySources(
      { filePath: exportedPath, exportName: 'AliasedService' },
      { tsconfig },
    );
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    expect(result.value).toEqual([]);
  });

  it('returns SOURCE_NOT_FOUND for a file outside the program', async () => {
    const result = await getDependencySources(
      { filePath: resolve(__dirname, './no-such-file.ts'), exportName: 'X' },
      { tsconfig },
    );
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('SOURCE_NOT_FOUND');
  });
});
