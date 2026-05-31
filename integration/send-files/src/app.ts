import { createApp, http } from '@zeltjs/core';

import { FileController } from './file.controller';

export const app = createApp([http({ controllers: [FileController] })]);
