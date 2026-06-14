import { Controller, Post } from '@zeltjs/core';
import { validated } from '@zeltjs/validator-valibot';
import * as v from 'valibot';

export const ValidatorImportSchema = v.object({
  name: v.string(),
});

@Controller('/validator-import')
export class ValidatorImportController {
  @Post('/')
  create(data = validated(ValidatorImportSchema)) {
    return data;
  }
}
