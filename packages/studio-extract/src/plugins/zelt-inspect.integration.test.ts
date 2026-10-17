import { relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runZeltInspect } from './zelt-inspect-runner.lib';

const ROOT = resolve(__dirname, '../../test-fixtures/studio-app');
const ENTRY = resolve(__dirname, './zelt-inspect-entry.ts');

describe('zelt inspector (integration)', () => {
  it('identifies a workspace dependency root through its public export', async () => {
    const root = resolve(__dirname, '../../test-fixtures/eventbus-app');
    const result = await runZeltInspect({
      request: {
        root,
        applicationId: 'workspace-eventbus',
        app: { filePath: 'src/app.ts', exportName: 'app' },
        tsconfig: resolve(root, 'tsconfig.json'),
      },
      entryPath: ENTRY,
      timeoutMs: 120_000,
    });

    expect(result.ok ? '' : result.errorOutput).toBe('');
    if (!result.ok) return;
    expect(result.inspection.registered).toContainEqual({
      package: '@zeltjs/eventbus',
      filePath: '',
      exportName: 'MemoryEventBusAdaptor',
    });
    expect(result.inspection.diagnostics).toEqual([]);
  }, 120_000);

  it.each([
    { layout: 'root tsconfig', root: ROOT, tsconfig: 'tsconfig.json' },
    { layout: 'nested tsconfig', root: ROOT, tsconfig: 'config/tsconfig.json' },
    {
      layout: 'workspace analysis root',
      root: resolve(ROOT, '../../../..'),
      tsconfig: 'config/tsconfig.json',
    },
  ])('returns local registrations with $layout', async ({ root, tsconfig }) => {
    const result = await runZeltInspect({
      request: {
        root,
        applicationId: 'fixture',
        app: { filePath: relative(root, resolve(ROOT, 'src/app.ts')), exportName: 'app' },
        tsconfig: resolve(ROOT, tsconfig),
      },
      entryPath: ENTRY,
      timeoutMs: 120_000,
    });

    expect(result.ok ? '' : result.errorOutput).toBe('');
    if (!result.ok) return;
    const { inspection } = result;

    expect(inspection.applicationId).toBe('fixture');
    expect(inspection.routes).toEqual([
      {
        controller: expect.objectContaining({ exportName: 'GreetingController' }),
        methodName: 'greet',
        method: 'GET',
        fullPath: '/greeting',
      },
    ]);
    expect(inspection.registered.map((ref) => ref.exportName).sort()).toEqual([
      'AuditMiddleware',
      'GreetingConfig',
      'GreetingController',
      'NotificationHandler',
    ]);
    expect(
      inspection.registered.every(
        (ref) =>
          ref.package === null &&
          ref.filePath.startsWith(`${relative(root, resolve(ROOT, 'src')).replaceAll('\\', '/')}/`),
      ),
    ).toBe(true);
    // 全 route の前を通るのは app が feature に書いた middlewares だけ
    expect(inspection.globalMiddlewares.map((ref) => ref.exportName)).toEqual(['AuditMiddleware']);

    const controller = inspection.classes.find(
      (cls) => cls.ref.exportName === 'GreetingController',
    );
    expect(controller).toBeDefined();
    if (controller === undefined) return;
    expect(controller.decorators).toContain('Controller');
    // decorator を書いた行と inject の行は、親が原文を引くための所在として運ぶ
    expect(controller.middlewares.map((use) => use.on)).toEqual([
      { kind: 'class' },
      { kind: 'method', name: 'greet' },
    ]);
    expect(controller.middlewares.every((use) => use.position !== null)).toBe(true);
    expect(controller.dependencies.map((dependency) => dependency.localName)).toEqual([
      'GreetingService',
    ]);
    expect(controller.dependencies[0]?.target).toEqual({
      package: null,
      filePath: relative(root, resolve(ROOT, 'src/greeting.service.ts')).replaceAll('\\', '/'),
      exportName: 'GreetingService',
    });
  }, 120_000);
});
