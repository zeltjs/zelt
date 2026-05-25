import { getControllerMetadata } from '@zeltjs/core';
import { describe, expect, it } from 'vitest';

import { HelloController } from '../src/hello.controller';
import { CleanupWebhook } from '../src/my-webhook/cleanup.webhook';

describe('getControllerMetadata', () => {
  it('returns the basePath of an @Controller-annotated class', () => {
    expect(getControllerMetadata(HelloController)).toEqual({ basePath: '/hello' });
  });

  it('returns undefined for classes not annotated with @Controller', () => {
    expect(getControllerMetadata(CleanupWebhook)).toBeUndefined();
  });

  it('returns undefined for plain classes', () => {
    class Plain {}
    expect(getControllerMetadata(Plain)).toBeUndefined();
  });
});
