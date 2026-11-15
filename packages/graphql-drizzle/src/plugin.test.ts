import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BuildContext } from '@zeltjs/cli';
import { graphql, Resolver } from '@zeltjs/graphql';
import { afterEach, describe, expect, it } from 'vitest';
import { drizzleGraphqlPlugin } from './codegen';
import { generatedModelKey } from './render.lib';
import * as schema from './test/fixtures/schema';

const root = resolve(__dirname, '../../..');
const directories: string[] = [];
const temp = async () => {
  await mkdir(join(root, '.tmp'), { recursive: true });
  const path = await mkdtemp(join(root, '.tmp/graphql-drizzle-plugin-'));
  directories.push(path);
  return path;
};
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const plugin = (out = './generated.ts') =>
  drizzleGraphqlPlugin({
    schema: './schema.ts',
    database: { module: './database.service.ts', export: 'DrizzleService' },
    out,
  });

const context = (
  cwd: string,
): BuildContext<{ http: { getControllers: () => readonly never[] } }> => ({
  cwd,
  build: {},
  loadModule: async () => schema,
  loadStaticApp: async () => {
    throw new Error('app must remain lazy during generation');
  },
  registerGeneratedFile: () => {},
});

describe('drizzleGraphqlPlugin lifecycle', () => {
  it('loads only schema, creates the output directory and rewrites every build', async () => {
    const cwd = await temp();
    const loaded: string[] = [];
    const registered: string[] = [];
    const ctx = {
      ...context(cwd),
      loadModule: async (path: string) => {
        loaded.push(path);
        return schema;
      },
      registerGeneratedFile: (path: string) => {
        registered.push(path);
      },
    };
    const instance = plugin('./generated/models.ts');
    await instance.preBuild?.(ctx);
    const path = join(cwd, 'generated/models.ts');
    const code = await readFile(path, 'utf8');
    await writeFile(path, 'stale');
    await instance.preBuild?.(ctx);
    expect(await readFile(path, 'utf8')).toBe(code);
    expect(loaded).toEqual([join(cwd, 'schema.ts'), join(cwd, 'schema.ts')]);
    expect(registered).toEqual([path, path]);
    expect(code).toContain('import * as schema from "../schema"');
  });

  it('recomputes on every build without retriggering dev watches for identical content', async () => {
    const cwd = await temp();
    const ctx = context(cwd);
    const instance = plugin();
    await instance.preBuild?.(ctx);
    const out = join(cwd, 'generated.ts');
    await utimes(out, 0, 0);
    await instance.preBuild?.(ctx);
    expect((await stat(out)).mtimeMs).toBe(0);
  });

  it('reports registration omissions in postBuild after generation', async () => {
    const cwd = await temp();
    const instance = plugin();
    const ctx = {
      ...context(cwd),
      loadStaticApp: async () => ({ http: { getControllers: () => [] } }),
    };
    await instance.preBuild?.(ctx);
    await expect(instance.postBuild?.(ctx, { success: true })).rejects.toThrow(
      'Model "User" requires exactly one resolver',
    );
  });

  it.each([1, 2])(
    'requires exactly one registered subclass per model (registrations=%i)',
    async (count) => {
      const cwd = await temp();
      const marker = generatedModelKey;
      class UserBase {
        static readonly [marker] = `${join(cwd, 'generated.ts')}#User`;
      }
      class PostBase {
        static readonly [marker] = `${join(cwd, 'generated.ts')}#Post`;
      }
      @Resolver()
      class UserResolver extends UserBase {}
      @Resolver()
      class OtherUserResolver extends UserBase {}
      @Resolver()
      class PostResolver extends PostBase {}
      const child = graphql({
        path: '/graphql',
        resolvers:
          count === 1
            ? [UserResolver, PostResolver]
            : [UserResolver, OtherUserResolver, PostResolver],
      });
      const ctx = {
        ...context(cwd),
        loadStaticApp: async () => ({
          http: { getControllers: () => child.blueprint().getControllers() },
        }),
      };
      const instance = plugin();
      await instance.preBuild?.(ctx);
      if (count === 1)
        await expect(instance.postBuild?.(ctx, { success: true })).resolves.toBeUndefined();
      else await expect(instance.postBuild?.(ctx, { success: true })).rejects.toThrow('found 2');
    },
  );

  it('does not hide an earlier failed build behind registration validation', async () => {
    const cwd = await temp();
    const ctx = context(cwd);
    const instance = plugin();
    await instance.preBuild?.(ctx);
    await expect(instance.postBuild?.(ctx, { success: false })).resolves.toBeUndefined();
  });
});
