import { afterAll } from 'bun:test';

import { shutdownAll } from '../shutdown-registry';

afterAll(shutdownAll);

export * from '../index';
