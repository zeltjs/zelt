import { describe, expect, it } from 'vitest';

import { Controller } from '../decorators/controller';
import { Get } from '../decorators/http-method';
import { createApp } from '../../app';

import { queryParam, queryParams } from './query-param';

describe('queryParam', () => {
  it('returns query parameter value', async () => {
    @Controller('/')
    class TestController {
      @Get('/search')
      search(q = queryParam('q')) {
        return { q };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();
    const res = await app.fetch(new Request('http://localhost/search?q=hello'));
    expect(await res.json()).toEqual({ q: 'hello' });
  });

  it('returns undefined for missing parameter', async () => {
    @Controller('/')
    class TestController {
      @Get('/search')
      search(q = queryParam('q')) {
        return { q: q ?? 'default' };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();
    const res = await app.fetch(new Request('http://localhost/search'));
    expect(await res.json()).toEqual({ q: 'default' });
  });
});

describe('queryParams', () => {
  it('returns multiple values for same parameter', async () => {
    @Controller('/')
    class TestController {
      @Get('/filter')
      filter(tags = queryParams('tag')) {
        return { tags };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();
    const res = await app.fetch(new Request('http://localhost/filter?tag=a&tag=b&tag=c'));
    expect(await res.json()).toEqual({ tags: ['a', 'b', 'c'] });
  });

  it('returns empty array for missing parameter', async () => {
    @Controller('/')
    class TestController {
      @Get('/filter')
      filter(tags = queryParams('tag')) {
        return { tags };
      }
    }

    const app = createApp({ http: { controllers: [TestController] } });
    await app.ready();
    const res = await app.fetch(new Request('http://localhost/filter'));
    expect(await res.json()).toEqual({ tags: [] });
  });
});
