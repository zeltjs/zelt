import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isClassConstructor } from '@zeltjs/unsafe-type-lib';
import { expect, it } from 'vitest';
import { generateGraphqlSdl } from './graphql-plugin.lib';
import { graphql } from './index';

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
  load(refs: readonly Pick<FreshModel, 'id'>[]): ReadonlyMap<FreshModel['id'], FreshModel | null> {
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
