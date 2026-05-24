import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';
import { Controller } from './controller';
import { getControllerMetadata } from './metadata';

describe('@Controller', () => {
  it('registers base path on the class', () => {
    @Controller('/users')
    class UserController {}

    const metadata = getControllerMetadata(UserController);
    expect(metadata?.basePath).toBe('/users');
  });

  it('preserves the class identity', () => {
    @Controller('/posts')
    class PostController {
      readonly tag = 'post' as const;
    }

    const instance = new PostController();
    expect(instance.tag).toBe('post');
  });

  it('makes the class resolvable from needle-di without explicit @injectable() (spec §4.7)', () => {
    @Controller('/x')
    class XController {
      hello() {
        return 'x';
      }
    }
    const container = new Container();
    container.bind(XController);
    expect(container.get(XController).hello()).toBe('x');
  });

  it('throws when applied more than once to the same class', () => {
    expect(() => {
      @Controller('/a')
      @Controller('/b')
      class DoubleController {}
      void DoubleController;
    }).toThrow(/@Controller cannot be applied more than once/);
  });
});
