import { afterAll } from '@jest/globals';

import { shutdownAll } from '../shutdown-registry';

afterAll(shutdownAll);

export * from '../index';
