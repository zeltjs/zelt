import { createApp } from '@zeltjs/core';

import { TenantRepositoryBase } from './repository/tenant.repository-base';

const runtime = await createApp([]).createRuntime();
const tenants = await runtime.get(TenantRepositoryBase);
const saved = await tenants.save({ pre: null, input: { id: 't1', name: 'acme' } });
if (saved.isErr()) throw saved.error;
console.log(JSON.stringify(saved.value));
await runtime.shutdown();
