import * as v from 'valibot';
import { Controller, Post } from '@zeltjs/core';

import { validated } from './validated';

export const UploadBody = v.object({
  name: v.string(),
  description: v.optional(v.string()),
});
export type UploadBody = v.InferOutput<typeof UploadBody>;

export type UploadResult = {
  success: boolean;
  name: string;
};

@Controller('/upload')
export class UploadController {
  @Post('/')
  async upload(body = validated(UploadBody, 'form')): Promise<UploadResult> {
    return { success: true, name: body.name };
  }
}
