import { generateOpenApi } from '@zeltjs/openapi';
import { valibotAdapter } from '@zeltjs/validator-valibot/openapi';

import { app } from '../src/app';

await generateOpenApi(app.http, {
  distDir: './generated',
  tsconfig: './tsconfig.json',
  schemaAdapter: valibotAdapter,
});
