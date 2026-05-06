import { MemoryKV } from '../memory-kv';

import { runAtomicKVStoreComplianceTests } from './compliance';

runAtomicKVStoreComplianceTests(() => new MemoryKV());
