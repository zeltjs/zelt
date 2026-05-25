import { Injectable } from '@zeltjs/core';

@Injectable()
export class BaseService {
  kind(): string {
    return 'base';
  }
}

@Injectable()
export class ExtendedService extends BaseService {
  override kind(): string {
    return 'extended';
  }

  bonus(): string {
    return 'bonus';
  }
}
