import { Controller, Post } from '@zeltjs/core';
import { request } from '@zeltjs/validator-valibot';
import * as v from 'valibot';

export const ValidatorImportSchema = v.object({
  name: v.string(),
});

@Controller('/validator-import')
export class ValidatorImportController {
  @Post('/')
  async create() {
    return await request(ValidatorImportSchema).body();
  }
}
