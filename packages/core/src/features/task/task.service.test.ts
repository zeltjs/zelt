import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import { inject, ZeltLifecycleStateError } from '../../kernel';
import { http } from '../http/http.feature';
import { Controller } from '../http/routing/controller.decorator';
import { Get } from '../http/routing/http-method.decorator';
import { TaskService } from './task.service';

describe('TaskService', () => {
  it('run() via runtime.get executes a task in the background', async () => {
    const app = createApp([]);
    const runtime = await app.createRuntime();
    const service = await runtime.get(TaskService);
    const task = vi.fn();

    service.run(task, { name: 'background-task' });

    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(1));
    await runtime.shutdown();
  });

  it('runtime.shutdown() drains active tasks even though TaskService was resolved lazily', async () => {
    const app = createApp([]);
    const runtime = await app.createRuntime();
    const service = await runtime.get(TaskService);
    const events: string[] = [];
    let finishTask!: () => void;
    const gate = new Promise<void>((resolve) => {
      finishTask = resolve;
    });

    service.run(async () => {
      await gate;
      events.push('task-finished');
    });

    const shutdownPromise = runtime.shutdown().then(() => events.push('shutdown-finished'));
    finishTask();
    await shutdownPromise;

    expect(events).toEqual(['task-finished', 'shutdown-finished']);
  });

  it('logs task failures through the logger with the task name', async () => {
    const app = createApp([]);
    const runtime = await app.createRuntime();
    const service = await runtime.get(TaskService);
    // ConsoleTransport.write() always calls console.log regardless of level
    // (see built-in-service/logger/transport/console.transport.ts and the
    // spy convention in logger.integration.test.ts) — do NOT spy console.error.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      service.run(
        () => {
          throw new Error('background failure');
        },
        { name: 'failing-task' },
      );

      await vi.waitFor(() => {
        const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
        expect(output).toContain('failing-task');
      });
    } finally {
      logSpy.mockRestore();
      await runtime.shutdown();
    }
  });

  it('afterResponse() from an HTTP controller starts the task after the response', async () => {
    const events: string[] = [];
    let finishTask!: () => void;
    const taskFinished = new Promise<void>((resolve) => {
      finishTask = resolve;
    });

    @Controller('/tasks')
    class TasksController {
      constructor(private readonly taskService: TaskService = inject(TaskService)) {}

      @Get('/after-response')
      runAfterResponse() {
        this.taskService.afterResponse(
          async () => {
            events.push('task-started');
            await taskFinished;
            events.push('task-finished');
          },
          { name: 'after-response-task' },
        );
        events.push('controller-returned');
        return { ok: true };
      }
    }

    const app = createApp([http({ controllers: [TasksController] })]);
    const runtime = await app.createRuntime();

    const response = await runtime.http.request('/tasks/after-response');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(events).toEqual(['controller-returned']);

    await vi.waitFor(() => expect(events).toEqual(['controller-returned', 'task-started']));
    finishTask();
    await vi.waitFor(() =>
      expect(events).toEqual(['controller-returned', 'task-started', 'task-finished']),
    );

    await runtime.shutdown();
  });

  it('afterResponse() outside an HTTP context falls back to background execution', async () => {
    const app = createApp([]);
    const runtime = await app.createRuntime();
    const taskService = await runtime.get(TaskService);
    const task = vi.fn();

    taskService.afterResponse(task, { name: 'fallback-task' });

    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(1));
    await runtime.shutdown();
  });

  it('run() and afterResponse() throw ZeltLifecycleStateError after shutdown', async () => {
    const app = createApp([]);
    const runtime = await app.createRuntime();
    const taskService = await runtime.get(TaskService);

    await runtime.shutdown();

    expect(() => taskService.run(() => {})).toThrow(ZeltLifecycleStateError);
    expect(() => taskService.afterResponse(() => {})).toThrow(ZeltLifecycleStateError);
  });
});
