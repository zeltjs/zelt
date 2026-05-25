import { body, Controller, Post } from '@zeltjs/core';

type JsonInput = { name: string; age: number };

@Controller('/body')
export class BodyParserController {
  @Post('/json')
  json(data = body('json') as JsonInput) {
    return { parsed: data };
  }

  @Post('/text')
  text(data = body('text')) {
    return { length: data.length, value: data };
  }

  @Post('/form')
  form(data = body('form')) {
    return { fields: data };
  }

  @Post('/multipart')
  multipart(data = body('form')) {
    const filename = data['file'] instanceof File ? data['file'].name : null;
    return { filename, label: data['label'] };
  }
}
