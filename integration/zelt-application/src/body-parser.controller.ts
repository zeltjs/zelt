import { Controller, Post, request } from '@zeltjs/core';
import * as v from 'valibot';

const FormSchema = v.record(v.string(), v.unknown());

@Controller('/body')
export class BodyParserController {
  @Post('/json')
  async json(req = request()) {
    const data = await req.body();
    return { parsed: data };
  }

  @Post('/form')
  async form(req = request(FormSchema, { target: 'form' })) {
    const data = await req.body();
    return { fields: data };
  }

  @Post('/multipart')
  async multipart(req = request(FormSchema, { target: 'form' })) {
    const data = await req.body();
    const filename = data['file'] instanceof File ? data['file'].name : null;
    return { filename, label: data['label'] };
  }
}
