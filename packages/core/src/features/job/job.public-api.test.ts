import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { Job, JobCapabilities } from '../../index';
import { createApp, JobFeature, JobService, jobs } from '../../index';

describe('job public API', () => {
  it('exports jobs feature and service from the package root', async () => {
    expect(jobs()).toBeInstanceOf(JobFeature);

    const app = createApp([jobs()]);
    const runtime = await app.createRuntime();
    const service = await runtime.get(JobService);
    const handle = vi.fn();
    const job = { name: 'public-api-job', handle } satisfies Job;

    expectTypeOf(runtime.jobs).toEqualTypeOf<JobCapabilities>();

    await service.dispatchSync(job);

    expect(handle).toHaveBeenCalledTimes(1);
    await runtime.shutdown();
  });
});
