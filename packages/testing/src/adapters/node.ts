import { after } from 'node:test';

import { shutdownAll } from '../shutdown-registry';

after(shutdownAll);

export * from '../index';
