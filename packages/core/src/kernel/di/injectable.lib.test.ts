import { Container } from '@needle-di/core';
import { getClassMetadata } from '@zeltjs/decorator-metadata';
import { describe, expect, it } from 'vitest';

import { ZeltDecoratorUsageError } from '../errors';
import { Injectable } from './injectable.lib';

@Injectable()
class TracedService {
  hello() {
    return 'world';
  }
}

describe('Injectable', () => {
  it('records zelt class metadata with the decorator name', () => {
    expect(getClassMetadata(TracedService)?.props).toEqual([{ decorator: 'Injectable' }]);
  });

  it('keeps needle-di auto-binding working', () => {
    const container = new Container();
    container.bind(TracedService);
    expect(container.get(TracedService).hello()).toBe('world');
  });

  it('throws when applied twice to the same class', () => {
    expect(() => {
      @Injectable()
      @Injectable()
      class Duplicated {}
      return Duplicated;
    }).toThrow(ZeltDecoratorUsageError);
  });
});
