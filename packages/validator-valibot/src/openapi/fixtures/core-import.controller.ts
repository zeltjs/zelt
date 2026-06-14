import { Controller, Post, validated } from '@zeltjs/core';
import * as v from 'valibot';

export const CoreImportSchema = v.object({
  name: v.string(),
});

@Controller('/core-import')
export class CoreImportController {
  @Post('/')
  create(data = validated(CoreImportSchema)) {
    return data;
  }
}
