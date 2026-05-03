import { createHttpApp } from '@koya/core';

import { HelloController } from './entry/hello.controller';

export const app = createHttpApp({ controllers: [HelloController] });
