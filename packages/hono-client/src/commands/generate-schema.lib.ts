import { cliSchema } from '@zeltjs/core';

export const generateSchema = cliSchema({
  options: [{ name: 'config', type: 'string', description: 'Path to zelt config file' }],
});
