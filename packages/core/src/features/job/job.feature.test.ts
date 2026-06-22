import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { createApp } from '../../app';
import { inject } from '../../kernel';
import { http } from '../http/http.feature';
import { Controller } from '../http/routing/controller.decorator';
import { Get } from '../http/routing/http-method.decorator';
import type { JobCapabilities } from './job.feature';
import { JobFeature, jobs } from './job.feature';
import { JobService } from './job.service';

describe('job feature', () => {
  it('jobs() returns JobFeature instance', () => {
    const feature = jobs();

    expect(feature).toBeInstanceOf(JobFeature);
    expect(feature.key).toBe('jobs');
  });

  it('infers jobs() as JobFeature', () => {
    expectTypeOf(jobs()).toEqualTypeOf<JobFeature>();
  });

  it('createApp([jobs()]) exposes empty job stats', async () => {
    const app = createApp([jobs()]);
    const runtime = await app.createRuntime();

    expectTypeOf(runtime.jobs).toEqualTypeOf<JobCapabilities>();
    expect(runtime.jobs.getJobStats()).toEqual({
      pending: 0,
      active: 0,
      failed: 0,
      shutdown: false,
    });

    await runtime.shutdown();
  });

  it('runtime.jobs.dispatchSync() runs a job', async () => {
    const app = createApp([jobs()]);
    const runtime = await app.createRuntime();
    const handle = vi.fn();

    await runtime.jobs.dispatchSync({ name: 'sync-job', handle });

    expect(handle).toHaveBeenCalledTimes(1);
    await runtime.shutdown();
  });

  it('keeps runtime job methods callable when destructured', async () => {
    const app = createApp([jobs()]);
    const runtime = await app.createRuntime();
    const handle = vi.fn();
    const { dispatchSync } = runtime.jobs;

    await dispatchSync({ name: 'destructured-sync-job', handle });

    expect(handle).toHaveBeenCalledTimes(1);
    await runtime.shutdown();
  });

  it('dispatchAfterResponse() from an HTTP controller starts the job after the response', async () => {
    const events: string[] = [];
    let finishJob!: () => void;
    const jobFinished = new Promise<void>((resolve) => {
      finishJob = resolve;
    });

    @Controller('/jobs')
    class JobsController {
      constructor(private readonly jobService: JobService = inject(JobService)) {}

      @Get('/after-response')
      runAfterResponse() {
        void this.jobService.dispatchAfterResponse({
          name: 'after-response-job',
          async handle() {
            events.push('job-started');
            await jobFinished;
            events.push('job-finished');
          },
        });
        events.push('controller-returned');
        return { ok: true };
      }
    }

    const app = createApp([jobs(), http({ controllers: [JobsController] })]);
    const runtime = await app.createRuntime();

    const response = await runtime.http.request('/jobs/after-response');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(events).toEqual(['controller-returned']);

    await vi.waitFor(() => expect(events).toEqual(['controller-returned', 'job-started']));
    finishJob();
    await vi.waitFor(() =>
      expect(events).toEqual(['controller-returned', 'job-started', 'job-finished']),
    );

    await runtime.shutdown();
  });

  it('dispatchAfterResponse() outside an HTTP context falls back to async dispatch', async () => {
    const app = createApp([jobs()]);
    const runtime = await app.createRuntime();
    const jobService = await runtime.get(JobService);
    const handle = vi.fn();

    await jobService.dispatchAfterResponse({ name: 'fallback-job', handle });

    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(1));
    await runtime.shutdown();
  });

  it('dispatchAfterResponse() fallback rejects after shutdown without an unhandled rejection', async () => {
    const app = createApp([jobs()]);
    const runtime = await app.createRuntime();
    const jobService = await runtime.get(JobService);
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      await runtime.shutdown();

      await expect(
        jobService.dispatchAfterResponse({ name: 'late-after-response-job', handle: () => {} }),
      ).rejects.toThrow(/dispatch/);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  it('runtime.jobs.dispatch() rejects after lifecycle shutdown', async () => {
    const app = createApp([jobs()]);
    const runtime = await app.createRuntime();

    await runtime.shutdown();

    await expect(runtime.jobs.dispatch({ name: 'late-job', handle: () => {} })).rejects.toThrow(
      /dispatch/,
    );
  });
});
