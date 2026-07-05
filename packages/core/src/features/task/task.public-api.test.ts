import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { TaskFunction, TaskOptions } from '../../index';
import { createApp, TaskService } from '../../index';

describe('task public API', () => {
  it('exports TaskService and task types from the package root', async () => {
    const app = createApp([]);
    const runtime = await app.createRuntime();
    const service = await runtime.get(TaskService);
    const task = vi.fn();

    expectTypeOf<TaskFunction>().toEqualTypeOf<() => void | Promise<void>>();
    expectTypeOf<TaskOptions>().toEqualTypeOf<{ readonly name?: string }>();

    await service.runAndWait(task);

    expect(task).toHaveBeenCalledTimes(1);
    await runtime.shutdown();
  });
});
