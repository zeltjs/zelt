import { createApp } from '@zeltjs/core';
import { eventbus, MemoryEventBusAdaptor } from '@zeltjs/eventbus';

export const app = createApp([eventbus({ adaptor: MemoryEventBusAdaptor })]);
