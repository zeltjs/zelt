import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runZeltInspect } from './zelt-inspect-runner.lib';

const ROOT = resolve(__dirname, '../../../../test-fixtures/studio-app');
const ENTRY = resolve(__dirname, './zelt-inspect-entry.ts');

describe('zelt inspector (integration)', () => {
  it('loads the fixture app in a child process and returns its registrations', async () => {
    const result = await runZeltInspect({
      request: {
        root: ROOT,
        applicationId: 'fixture',
        app: { filePath: 'src/app.ts', exportName: 'app' },
        tsconfig: resolve(ROOT, 'tsconfig.json'),
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
    // 全 route の前を通るのは app が feature に書いた middlewares だけ
    expect(inspection.globalMiddlewares.map((ref) => ref.exportName)).toEqual(['AuditMiddleware']);

    const controller = inspection.classes.find(
      (cls) => cls.ref.exportName === 'GreetingController',
    );
    expect(controller?.decorators).toContain('Controller');
    // decorator を書いた行と inject の行は、親が原文を引くための所在として運ぶ
    expect(controller?.middlewares.map((use) => use.on)).toEqual([
      { kind: 'class' },
      { kind: 'method', name: 'greet' },
    ]);
    expect(controller?.middlewares.every((use) => use.position !== null)).toBe(true);
    expect(controller?.dependencies.map((dependency) => dependency.localName)).toEqual([
      'GreetingService',
    ]);
  }, 120_000);
});
