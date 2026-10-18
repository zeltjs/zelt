import { onTinyjs } from '@zeltjs/adapter-tinyjs';
import { app } from './app';

const desktop = await onTinyjs(app);
export const { api, init } = desktop.bridge.create(desktop.http);
