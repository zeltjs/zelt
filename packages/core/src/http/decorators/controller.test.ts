import { Container } from '@needle-di/core';
import { describe, expect, it } from 'vitest';

import { getControllerMetadata } from '../internal/metadata';

import { Controller } from './controller';

describe('@Controller', () => {
  it('registers base path on the class', () => {
    @Controller('/users')
    class UserController {}

    expect(getControllerMetadata(UserController)).toEqual({ basePath: '/users' });
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
});
