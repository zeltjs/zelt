import { createHttpApp } from '@koya/core';

import { controllers } from './controllers';

export const app = createHttpApp({ controllers });
