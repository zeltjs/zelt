import { afterAll } from 'vitest';

import { shutdownAll } from '../shutdown-registry';

afterAll(shutdownAll);

export * from '../index';
