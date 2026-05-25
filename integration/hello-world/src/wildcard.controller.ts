import { Controller, Get } from '@zeltjs/core';

@Controller('/tests')
export class WildcardController {
  @Get('/wildcard')
  wildcard() {
    return 'wildcard';
  }

  @Get('/wildcard/nested')
  wildcardNested() {
    return 'wildcard_nested';
  }
}
