import { Injectable } from '@zeltjs/core';

@Injectable()
export class ClockService {
  now(): string {
    return new Date().toISOString();
  }
}
