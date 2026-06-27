import { Controller, Post, request } from '@zeltjs/core';
import * as v from 'valibot';

export const CoreImportSchema = v.object({
  name: v.string(),
});

@Controller('/core-import')
export class CoreImportController {
  @Post('/')
  async create() {
    return await request(CoreImportSchema).body();
  }
}
