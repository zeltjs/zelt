import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isClassConstructor } from '@zeltjs/unsafe-type-lib';
import { expect, it } from 'vitest';
import { generateGraphqlSdl } from './graphql-plugin.lib';
import { computeGraphqlPrebuiltHash, graphql } from './index';

it('rechecks type-only changes when generating twice in the same process', async () => {
  const scratch = resolve(__dirname, '../../../.tmp');
  await mkdir(scratch, { recursive: true });
  const cwd = await mkdtemp(join(scratch, 'graphql-rebuild-'));
  try {
    const sourceFile = join(cwd, 'resolver.ts');
    const tsconfig = join(cwd, 'tsconfig.json');
    const source = `
import { Resolver, Query, ResolveMultiField } from ${JSON.stringify(resolve(__dirname, 'index'))};
type FreshModel = { id: string; label: string };
@Resolver()
export class FreshResolver {
  @Query()
  fresh(): Pick<FreshModel, 'id'> { return { id: '1' }; }
  @ResolveMultiField()
  load(refs: readonly Pick<FreshModel, 'id'>[]): ReadonlyMap<FreshModel['id'], FreshModel> {
    return new Map(refs.map(({id}) => [id, {id, label: 'value'}]));
  }
}
`;
    await writeFile(sourceFile, source);
    await writeFile(
      tsconfig,
      JSON.stringify({
        extends: resolve(__dirname, '../tsconfig.json'),
        compilerOptions: { rootDir: '.', composite: false },
        include: ['resolver.ts'],
      }),
    );
    const loaded: unknown = await import(/* @vite-ignore */ pathToFileURL(sourceFile).href);
    if (typeof loaded !== 'object' || loaded === null) throw new Error('Fixture module missing');
    const FreshResolver: unknown = Reflect.get(loaded, 'FreshResolver');
    if (!isClassConstructor(FreshResolver)) throw new Error('Fixture resolver missing');
    const endpoint = graphql({ path: '/graphql', resolvers: [FreshResolver] });
    const app = { getControllers: () => endpoint.blueprint().getControllers() };
    const options = { cwd, tsconfig };
    await generateGraphqlSdl(app, options);
    const output = join(cwd, '.zelt/graphql/graphql.runtime.graphql');
    expect(await readFile(output, 'utf8')).toContain('label: String!');
    await writeFile(sourceFile, source.replace('label: string', 'label: string | null'));
    const result = await generateGraphqlSdl(app, options);
    expect(result.changed).toBe(true);
    const regenerated = await readFile(output, 'utf8');
    expect(regenerated).toContain('label: String\n');
    expect(regenerated).not.toContain('label: String!');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

it('rebuilds merged interface changes while keeping the runtime declaration hash boundary', async () => {
  const scratch = resolve(__dirname, '../../../.tmp');
  await mkdir(scratch, { recursive: true });
  const cwd = await mkdtemp(join(scratch, 'graphql-augmentation-'));
  try {
    const sourceFile = join(cwd, 'resolver.ts');
    const augmentationFile = join(cwd, 'augmentation.ts');
    const tsconfig = join(cwd, 'tsconfig.json');
    await writeFile(
      join(cwd, 'model.ts'),
      'export interface AugmentedModel { readonly id: string }',
    );
    const augmentation = `
import './model';
declare module './model' {
  interface AugmentedModel { readonly displayName: string; readonly initials: string }
}
`;
    await writeFile(augmentationFile, augmentation);
    const source = `
import { Resolver, Query, ResolveField } from ${JSON.stringify(resolve(__dirname, 'index'))};
import type { AugmentedModel } from './model';
@Resolver()
export class AugmentedResolver {
  @Query()
  model(): Pick<AugmentedModel, 'id'> { return { id: '1' }; }
  @ResolveField()
  displayName(_model: Pick<AugmentedModel, 'id'>): AugmentedModel['displayName'] { return 'Name'; }
  @ResolveField()
  initials(_model: Pick<AugmentedModel, 'displayName'>): string { return 'N'; }
}
`;
    await writeFile(sourceFile, source);
    await writeFile(
      tsconfig,
      JSON.stringify({
        extends: resolve(__dirname, '../tsconfig.json'),
        compilerOptions: { rootDir: '.', composite: false },
        include: ['*.ts'],
      }),
    );
    const loaded: unknown = await import(/* @vite-ignore */ pathToFileURL(sourceFile).href);
    if (typeof loaded !== 'object' || loaded === null) throw new Error('Fixture module missing');
    const AugmentedResolver: unknown = Reflect.get(loaded, 'AugmentedResolver');
    if (!isClassConstructor(AugmentedResolver)) throw new Error('Fixture resolver missing');
    const endpoint = graphql({ path: '/graphql', resolvers: [AugmentedResolver] });
    const app = { getControllers: () => endpoint.blueprint().getControllers() };
    const options = { cwd, tsconfig };
    const output = join(cwd, '.zelt/graphql/graphql.runtime.graphql');
    const hash = await computeGraphqlPrebuiltHash('/graphql', [AugmentedResolver]);
    await generateGraphqlSdl(app, options);
    expect(await readFile(output, 'utf8')).toContain('displayName: String!');
    expect(await readFile(output, 'utf8')).toContain('initials: String!');

    await writeFile(
      augmentationFile,
      augmentation.replace('displayName: string', 'displayName: string | null'),
    );
    expect((await generateGraphqlSdl(app, options)).changed).toBe(true);
    expect(await readFile(output, 'utf8')).toContain('displayName: String\n');
    // Augmentations are erased from JavaScript, just like other model-only type changes.
    expect(await computeGraphqlPrebuiltHash('/graphql', [AugmentedResolver])).toBe(hash);

    await writeFile(augmentationFile, augmentation.replace('readonly displayName: string;', ''));
    await expect(generateGraphqlSdl(app, options)).rejects.toThrow(
      'must be declared in AugmentedModel',
    );

    await writeFile(
      augmentationFile,
      augmentation.replace(
        'readonly displayName: string;',
        'readonly missing: string; readonly displayName: string;',
      ),
    );
    await expect(generateGraphqlSdl(app, options)).rejects.toThrow(
      'AugmentedModel.missing has no resolver',
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
