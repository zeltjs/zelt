import type { ServiceResolver } from '../../app';
import { Feature } from '../../app';
import { JobService } from './job.service';
import type { JobDispatcher } from './job.types';

export type JobCapabilities = JobDispatcher;

export class JobFeature extends Feature<'jobs', JobCapabilities> {
  readonly key = 'jobs' as const;

  readonly featureClasses = (): readonly [] => {
    return [];
  };

  readonly blueprint = (): Record<never, never> => {
    return {};
  };

  readonly realize = async (resolver: ServiceResolver): Promise<JobCapabilities> => {
    const service = await resolver.get(JobService);
    return {
      dispatch: (job, options) => service.dispatch(job, options),
      dispatchSync: (job) => service.dispatchSync(job),
      dispatchAfterResponse: (job) => service.dispatchAfterResponse(job),
      getJobStats: () => service.getJobStats(),
      getJobFailures: () => service.getJobFailures(),
    };
  };
}

export const jobs = (): JobFeature => new JobFeature();
